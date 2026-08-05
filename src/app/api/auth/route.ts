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

  /*
   * One link per address per minute.
   *
   * Without this, anyone who knows a colleague's address can post it in a loop
   * and fill their inbox from this server — the app becomes the abuse, and the
   * sending domain pays for it in reputation. Harmless while links printed to a
   * terminal; a real problem the moment mail is configured, which it now can be.
   *
   * Keyed on the address rather than the IP, because the address is the thing
   * being harmed and an IP is trivially changed. That means someone can still
   * flood many DIFFERENT addresses slowly; the answer to that is a provider's
   * own rate limit, not something this app can honestly claim to solve.
   *
   * In memory on purpose: a restart clearing it costs one extra email, and a
   * table would need sweeping. The refusal is deliberately indistinguishable
   * from success — saying "too soon" to an address confirms it has an account.
   */
  const now = Date.now();
  const last = recent.get(email);
  if (last && now - last < LINK_INTERVAL_MS) {
    return NextResponse.json({ ok: true, ttlMinutes: TOKEN_TTL_MIN, via: transport() });
  }
  recent.set(email, now);
  if (recent.size > 500) {
    for (const [k, t] of recent) if (now - t > LINK_INTERVAL_MS) recent.delete(k);
  }

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
    /* baseUrl(), not a third reading of DEUTSCHMATE_URL. This said
       `|| new URL(req.url).origin` and /wer said `|| "http://localhost:3000"`,
       so with the variable unset the same account got links pointing at
       different hosts depending on which screen asked — and neither matched
       what `npm run config` reported. */
    const t = createSignInToken(user.id, baseUrl());
    await deliver(email, t.url, t.expiresAt);
  }

  return NextResponse.json({ ok: true, ttlMinutes: TOKEN_TTL_MIN, via: transport() });
}
