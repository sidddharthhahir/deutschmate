import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readJson, badRequest, str } from "@/lib/http";
import {
  SESSION_COOKIE,
  UID_COOKIE,
  createSignInToken,
  deliver,
  destroySession,
  normaliseEmail,
  sweepExpired,
  TOKEN_TTL_MIN,
} from "@/lib/auth";
import { anyUsers, createUserByEmail, userByEmail } from "@/lib/user";
import { mailReady, transport } from "@/lib/mail";
import { baseUrl } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** When each address was last sent a link. See the throttle in POST. */
const recent = new Map<string, number>();
const LINK_INTERVAL_MS = 60_000;

/**
 * Ask for a sign-in link, or sign out. The link goes to the address; the response says only that
 * it was sent if it could be.
 */
export async function POST(req: Request) {
  const raw = await readJson(req);
  const action = str(raw.action, 20);

  if (action === "signout") {
    const jar = await cookies();
    destroySession(jar.get(SESSION_COOKIE)?.value);
    jar.delete(SESSION_COOKIE);
    jar.delete(UID_COOKIE);
    return NextResponse.json({ ok: true });
  }

  const email = normaliseEmail(str(raw.email, 254));
  if (!email) return badRequest("an email address is required");

  /*
   * One link per address per minute. The refusal is deliberately indistinguishable from success —
   * saying "too soon" to an address confirms it has an account.
   */
  const now = Date.now();
  const last = recent.get(email);
  if (last && now - last < LINK_INTERVAL_MS) {
    return NextResponse.json({
      ok: true,
      ttlMinutes: TOKEN_TTL_MIN,
      via: transport(),
    });
  }
  recent.set(email, now);
  if (recent.size > 500) {
    for (const [k, t] of recent)
      if (now - t > LINK_INTERVAL_MS) recent.delete(k);
  }

  sweepExpired();

  /* First run: nobody has an account, so the first address to ask gets one and
     there is no one to protect it from yet. Every later address must already
     exist — otherwise this is an open sign-up form, which is a decision for the
     day the app is public, not a side effect of the sign-in route. */
  const user = anyUsers() ? userByEmail(email) : createUserByEmail(email);

  /*
   * Mail being broken is a fact about this server, not about the address, so it can be reported
   * without leaking anything: the answer is identical whether or not an account exists.
   */
  const ready = mailReady();
  if (!ready.ok) {
    return NextResponse.json(
      { ok: false, error: `this server cannot send email: ${ready.why}` },
      { status: 503 },
    );
  }

  if (user) {
    /* baseUrl(), not a third reading of DEUTSCHMATE_URL. */
    const t = createSignInToken(user.id, baseUrl());
    await deliver(email, t.url, t.expiresAt);
  }

  return NextResponse.json({
    ok: true,
    ttlMinutes: TOKEN_TTL_MIN,
    via: transport(),
  });
}
