import { randomBytes, createHash } from "node:crypto";
import { get, run } from "./db.ts";

/** Sign-in, without passwords and without a dependency. */

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

/*
 * `sameSecret`, a constant-time compare, used to sit here. `sessionsFor(userId)` went the same
 * way: an admin listing for a screen that was never built.
 */

// ------------------------------------------------------------------- email
/**
 * Normalise an address enough to use as an identity. Deliberately NOT a validity check — no regex
 * decides whether an address is real, only delivery does.
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

/** Mint a single-use sign-in link for an account. */
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
 * Redeem a token. Marks it used inside the same statement that requires it to be unused, so two
 * simultaneous redemptions cannot both succeed — `changes` tells us which one won.
 */
export function redeemSignInToken(token: string): string | null {
  if (!token || token.length < 20) return null;
  const res = run(
    `UPDATE auth_token SET used_at = datetime('now')
      WHERE hash = ? AND used_at IS NULL AND expires_at > datetime('now')`,
    sha(token),
  );
  if (!res.changes) return null;
  return (
    get<{ user_id: string }>(
      "SELECT user_id FROM auth_token WHERE hash = ?",
      sha(token),
    )?.user_id ?? null
  );
}

// ---------------------------------------------------------------- sessions
export function createSession(userId: string): {
  value: string;
  expiresAt: Date;
} {
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
  run(
    "UPDATE session SET seen_at = datetime('now') WHERE hash = ?",
    sha(value),
  );
  return row.user_id;
}

export function destroySession(value: string | undefined) {
  if (value) run("DELETE FROM session WHERE hash = ?", sha(value));
}

/** Every session for a learner — "sign out everywhere", and account deletion. */
export function destroyAllSessions(userId: string) {
  run("DELETE FROM session WHERE user_id = ?", userId);
}

/** Housekeeping. */
export function sweepExpired() {
  run("DELETE FROM session WHERE expires_at <= datetime('now')");
  run(
    "DELETE FROM auth_token WHERE expires_at <= datetime('now') OR used_at IS NOT NULL",
  );
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
 * Where a sign-in link goes. IT NEVER RETURNS THE LINK TO THE CALLER, and that is the whole reason
 * this is a function rather than something the route does inline.
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
