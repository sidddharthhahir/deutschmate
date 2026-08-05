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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ask for a sign-in link, or sign out.
 *
 * THE ANSWER IS THE SAME WHETHER OR NOT THE ACCOUNT EXISTS.
 *
 * "No account with that address" turns this endpoint into a way to find out who
 * has one, which for a five-person install is a list of five colleagues' email
 * addresses. The link goes to the address; the response says only that it was
 * sent if it could be.
 *
 * The link is never in the response body. If it were, asking for somebody
 * else's address would hand you their account.
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

  sweepExpired();

  /* First run: nobody has an account, so the first address to ask gets one and
     there is no one to protect it from yet. Every later address must already
     exist — otherwise this is an open sign-up form, which is a decision for the
     day the app is public, not a side effect of the sign-in route. */
  const user = anyUsers() ? userByEmail(email) : createUserByEmail(email);

  /*
   * Mail being broken is a fact about this server, not about the address, so it
   * can be reported without leaking anything: the answer is identical whether
   * or not an account exists. Checked BEFORE the lookup for that reason.
   *
   * A send that fails *after* the lookup cannot be reported the same way —
   * "sending failed" would then mean "this address has an account". Those fall
   * back to the terminal and a loud server log, and the caller still sees the
   * same success. Someone waiting on an email they will not get is bad; handing
   * a stranger a list of who works here is worse.
   */
  const ready = mailReady();
  if (!ready.ok) {
    return NextResponse.json(
      { ok: false, error: `this server cannot send email: ${ready.why}` },
      { status: 503 },
    );
  }

  if (user) {
    const base = process.env.DEUTSCHMATE_URL || new URL(req.url).origin;
    const t = createSignInToken(user.id, base);
    await deliver(email, t.url, t.expiresAt);
  }

  return NextResponse.json({ ok: true, ttlMinutes: TOKEN_TTL_MIN, via: transport() });
}
