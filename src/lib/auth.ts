import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { all, get, run } from "./db.ts";

/**
 * Sign-in, without passwords and without a dependency.
 *
 * WHAT REPLACED WHAT
 *
 * Identity used to be a plain name in a readable cookie: `dm_user=sid`. Anyone
 * could set it from the console, and until the previous commit anyone could
 * also just name you in a query string. That was the documented design for two
 * flatmates (spec §10) and it does not survive a third person.
 *
 * Now: you prove you hold an email address by following a single-use link, and
 * get a random 32-byte session token in an httpOnly cookie. No password is
 * stored, hashed or otherwise — a password needs a reset flow and a policy, and
 * each of those is another way to leak something.
 *
 * WHAT IS STORED
 *
 * Only sha256 of each secret. The rows are verifiers: a copy of the database —
 * a backup, a file pulled off a box — must not let anyone sign in as anyone.
 * sha256 rather than a KDF is correct here because the secret is 32 random
 * bytes and there is no guessing to slow down.
 *
 * DELIVERY IS PLUGGABLE, AND TODAY IT IS THE CONSOLE
 *
 * A magic link needs an email provider: an account, an API key, a domain with
 * SPF and DKIM, and a network. This repo has kept `npm run setup` working with
 * none of those (spec §17), and the immediate users are people in the same
 * flat and the same office. So the link is printed server-side and handed over
 * by whoever runs the server. `deliver()` is the single seam an email adapter
 * drops into later — the flow above it does not change.
 *
 * The link is NEVER returned in an HTTP response. If it were, requesting a
 * sign-in for someone else's address would hand you their account.
 */

const TOKEN_BYTES = 32;
/** Long enough to walk to another room; short enough that a leaked link rots. */
export const TOKEN_TTL_MIN = 20;
/** Re-sign-in every fortnight. Long, because losing a session costs a learner a streak. */
export const SESSION_TTL_DAYS = 14;

/* Both names live in who.ts, which imports nothing — the middleware needs
   SESSION_COOKIE and cannot import this file, because node:sqlite does not
   exist in the edge runtime. */
export { SESSION_COOKIE, UID_COOKIE } from "./who.ts";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const secret = () => randomBytes(TOKEN_BYTES).toString("base64url");

/** Constant-time compare, for anything derived from user input. */
export function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(sha(a), "hex");
  const y = Buffer.from(sha(b), "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

// ------------------------------------------------------------------- email
/**
 * Normalise an address enough to use as an identity.
 *
 * Deliberately NOT a validity check — no regex decides whether an address is
 * real, only delivery does. This lowercases and trims so that `Anna@x.de` and
 * `anna@x.de ` are one account rather than two, and rejects only what cannot
 * be an address at all.
 */
export function normaliseEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  if (e.length < 3 || e.length > 254) return null;
  const at = e.indexOf("@");
  if (at < 1 || at !== e.lastIndexOf("@") || at === e.length - 1) return null;
  if (/\s/.test(e)) return null;
  return e;
}

// ------------------------------------------------------------- sign-in link
export type Token = { token: string; url: string; expiresAt: string };

/**
 * Mint a single-use sign-in link for an account.
 *
 * Any unused token for the same account is invalidated first: asking for a new
 * link should make the old one stop working, or a forwarded email stays live.
 */
export function createSignInToken(userId: string, baseUrl: string): Token {
  run("DELETE FROM auth_token WHERE user_id = ? AND used_at IS NULL", userId);
  const token = secret();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60_000).toISOString();
  run(
    "INSERT INTO auth_token (hash, user_id, expires_at) VALUES (?, ?, ?)",
    sha(token),
    userId,
    expiresAt,
  );
  return {
    token,
    /* A route handler, not the sign-in page: only a Route Handler or a Server
       Action can set a cookie, and a page trying to do it is a 500. */
    url: `${baseUrl.replace(/\/$/, "")}/api/auth/callback?token=${encodeURIComponent(token)}`,
    expiresAt,
  };
}

/**
 * Redeem a token. Returns the user id, or null.
 *
 * Marks it used inside the same statement that requires it to be unused, so two
 * simultaneous redemptions cannot both succeed — `changes` tells us which one
 * won. Doing this as SELECT-then-UPDATE would be a race, and the prize for
 * winning it is somebody else's account.
 */
export function redeemSignInToken(token: string): string | null {
  if (!token || token.length < 20) return null;
  const res = run(
    `UPDATE auth_token SET used_at = datetime('now')
      WHERE hash = ? AND used_at IS NULL AND expires_at > datetime('now')`,
    sha(token),
  );
  if (!res.changes) return null;
  return get<{ user_id: string }>("SELECT user_id FROM auth_token WHERE hash = ?", sha(token))
    ?.user_id ?? null;
}

// ---------------------------------------------------------------- sessions
export function createSession(userId: string): { value: string; expiresAt: Date } {
  const value = secret();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  run(
    "INSERT INTO session (hash, user_id, expires_at) VALUES (?, ?, ?)",
    sha(value),
    userId,
    expiresAt.toISOString(),
  );
  return { value, expiresAt };
}

/** The learner this session belongs to, or null if it is unknown or expired. */
export function userIdForSession(value: string | undefined): string | null {
  if (!value || value.length < 20) return null;
  const row = get<{ user_id: string }>(
    "SELECT user_id FROM session WHERE hash = ? AND expires_at > datetime('now')",
    sha(value),
  );
  if (!row) return null;
  // Cheap liveness, so an idle session can be aged out later without a job.
  run("UPDATE session SET seen_at = datetime('now') WHERE hash = ?", sha(value));
  return row.user_id;
}

export function destroySession(value: string | undefined) {
  if (value) run("DELETE FROM session WHERE hash = ?", sha(value));
}

/** Every session for a learner — "sign out everywhere", and account deletion. */
export function destroyAllSessions(userId: string) {
  run("DELETE FROM session WHERE user_id = ?", userId);
}

/**
 * Housekeeping. Cheap enough to run on any sign-in rather than needing a job —
 * this app has no scheduler and should not grow one for two DELETEs.
 */
export function sweepExpired() {
  run("DELETE FROM session WHERE expires_at <= datetime('now')");
  run("DELETE FROM auth_token WHERE expires_at <= datetime('now') OR used_at IS NOT NULL");
}

// ---------------------------------------------------------------- delivery
/** The terminal box. Also the rescue path when a real send fails. */
function printLink(email: string, url: string, mins: number, note?: string) {
  console.log(
    [
      "",
      "  ┌─ DeutschMate — sign-in link " + "─".repeat(28),
      `  │  for:     ${email}`,
      `  │  expires: in ${mins} minutes, and on first use`,
      "  │",
      `  │  ${url}`,
      ...(note ? ["  │", `  │  ${note}`] : []),
      "  └" + "─".repeat(58),
      "",
    ].join("\n"),
  );
}

/**
 * Where a sign-in link goes.
 *
 * One seam, and now it has two sides. With no mail configured this still prints
 * to the server terminal, which keeps `npm run setup` working with no account,
 * no domain and no network (spec §17) — that is the default and stays it. With
 * SMTP or Resend configured, the link goes to the address instead.
 *
 * IT NEVER RETURNS THE LINK TO THE CALLER, and that is the whole reason this is
 * a function rather than something the route does inline. `POST /api/auth`
 * answers the same way whether or not the address exists, so the response
 * cannot be used to discover who has an account — and could not carry the link
 * even if somebody tried, because it does not have it.
 *
 * IT NEVER THROWS. A dead SMTP host must not turn into a 500 that says "this
 * address exists, and our mail is broken". It returns what happened so the
 * caller can log it, and on failure it falls back to printing the link — losing
 * the link entirely would strand a real person mid-sign-in for no benefit.
 */
export async function deliver(
  email: string,
  url: string,
  expiresAt: string,
): Promise<{ sent: boolean; via: string; error?: string }> {
  const mins = Math.round((Date.parse(expiresAt) - Date.now()) / 60_000);
  /* Imported here rather than at the top so that nodemailer is not in the
     module graph of everything that touches auth.ts. Almost every request in
     the app calls userIdForSession() from this file; none of them should pay to
     load an SMTP library to read a cookie. */
  const { sendMail, transport } = await import("./mail.ts");
  const { signInEmail } = await import("./mail-templates.ts");

  const via = transport();
  if (via === "console") {
    printLink(email, url, mins);
    return { sent: true, via };
  }

  const res = await sendMail(signInEmail(email, url, mins));
  if (res.ok) {
    // The address, not the link: a server log is not a secure place for a live
    // credential, and anyone who can read this log can already read the box
    // above — but there is no reason to put it there when nothing needs it.
    console.log(`  ✓ sign-in link sent to ${email} via ${via}`);
    return { sent: true, via };
  }

  console.error(`  ✗ could not send to ${email} via ${via}: ${res.error}`);
  printLink(email, url, mins, "mail failed — paste this to them by hand");
  return { sent: false, via, error: res.error };
}

// ------------------------------------------------------------------ admin
export function sessionsFor(userId: string) {
  return all<{ created_at: string; seen_at: string; expires_at: string }>(
    "SELECT created_at, seen_at, expires_at FROM session WHERE user_id = ? ORDER BY seen_at DESC",
    userId,
  );
}
