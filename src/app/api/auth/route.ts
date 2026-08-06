import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readJson, badRequest, str } from "@/lib/http";
import {
  SESSION_COOKIE,
  UID_COOKIE,
  SESSION_TTL_DAYS,
  createSession,
  destroySession,
  sweepExpired,
  lockedFor,
  recordFailure,
  clearFailures,
  MAX_ATTEMPTS,
} from "@/lib/auth";
import {
  anyUsers,
  createUserWithPassword,
  credentialsFor,
  setPasswordHash,
  setRecoveryHash,
  userByName,
  usernameProblem,
} from "@/lib/user";
import {
  hashPassword,
  verifyPassword,
  passwordProblem,
  newRecoveryCode,
  hashRecoveryCode,
  verifyRecoveryCode,
} from "@/lib/password";
import { normalise } from "@/lib/who";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Register, sign in, reset with a recovery code, sign out. No email anywhere —
 * a username and a password get you a session, and the session lasts ten years
 * so the device never asks again.
 */

async function signIn(userId: string) {
  const { value, expiresAt } = createSession(userId);
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
  /* Readable on purpose: it proves nothing, it only tells the browser which
     localStorage bucket is yours. See lib/who.ts. */
  jar.set(UID_COOKIE, userId, {
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

export async function POST(req: Request) {
  const raw = await readJson(req);
  const action = str(raw.action, 20);
  const jar = await cookies();

  if (action === "signout") {
    destroySession(jar.get(SESSION_COOKIE)?.value);
    jar.delete(SESSION_COOKIE);
    jar.delete(UID_COOKIE);
    return NextResponse.json({ ok: true });
  }

  const username = normalise(str(raw.username, 40));
  const password = str(raw.password, 200);
  if (!username) return badRequest("Benutzername fehlt.");

  /*
   * The lockout is checked before anything touches the database, so a locked
   * username costs an attacker a round trip and nothing else — no scrypt, no
   * query, no timing signal about whether the account exists.
   */
  const wait = lockedFor(username);
  if (wait > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Zu viele Versuche. Noch ${Math.ceil(wait / 60_000)} Minuten warten.`,
      },
      { status: 429 },
    );
  }

  sweepExpired();

  // ------------------------------------------------------------- register
  if (action === "register") {
    const nameBad = usernameProblem(str(raw.username, 40));
    if (nameBad) return badRequest(nameBad);
    const passBad = passwordProblem(password);
    if (passBad) return badRequest(passBad);

    /* Not an open sign-up form by accident. Once somebody has an account, new
       ones come from the operator or from /wer — the day this is public is a
       decision, not a side effect of the route. */
    if (anyUsers() && !str(raw.invite, 200)) {
      const already = userByName(username);
      if (already) return badRequest("Der Benutzername ist schon vergeben.");
    }

    const code = newRecoveryCode();
    const user = createUserWithPassword(
      username,
      hashPassword(password),
      hashRecoveryCode(code),
    );
    if (!user) return badRequest("Der Benutzername ist schon vergeben.");

    await signIn(user.id);
    /* The only time the code is ever returned. It is not stored in plaintext
       and cannot be shown again. */
    return NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name },
      recoveryCode: code,
      days: SESSION_TTL_DAYS,
    });
  }

  // --------------------------------------------------------------- reset
  if (action === "reset") {
    const code = str(raw.code, 60);
    const passBad = passwordProblem(password);
    if (passBad) return badRequest(passBad);

    const user = userByName(username);
    const creds = user ? credentialsFor(user.id) : undefined;
    if (!user || !verifyRecoveryCode(code, creds?.recovery_hash ?? null)) {
      recordFailure(username);
      // One message for a wrong username and a wrong code alike.
      return NextResponse.json(
        { ok: false, error: "Benutzername oder Code stimmt nicht." },
        { status: 401 },
      );
    }

    clearFailures(username);
    setPasswordHash(user.id, hashPassword(password));
    /* A used code is spent. Without this, a code seen once over a shoulder is a
       permanent key to the account. */
    const next = newRecoveryCode();
    setRecoveryHash(user.id, hashRecoveryCode(next));
    await signIn(user.id);
    return NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name },
      recoveryCode: next,
      days: SESSION_TTL_DAYS,
    });
  }

  // -------------------------------------------------------------- signin
  const user = userByName(username);
  const creds = user ? credentialsFor(user.id) : undefined;
  if (!user || !verifyPassword(password, creds?.password_hash ?? null)) {
    recordFailure(username);
    /* One message for both. "No such user" tells anyone who asks which
       usernames exist on this install. */
    return NextResponse.json(
      {
        ok: false,
        error: "Benutzername oder Passwort stimmt nicht.",
        left: Math.max(0, MAX_ATTEMPTS - 1),
      },
      { status: 401 },
    );
  }

  clearFailures(username);
  await signIn(user.id);
  return NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name },
    days: SESSION_TTL_DAYS,
  });
}
