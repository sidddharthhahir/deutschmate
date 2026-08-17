import { randomBytes, createHash } from "node:crypto";
import { get, run } from "./db.ts";

/** Sessions. A username and a password get you one; nothing else does. */

const TOKEN_BYTES = 32;

/**
 * Ten years — "this device never asks again", which is the point. A learner opens
 * this daily for months and a sign-in screen between them and the one button is
 * pure friction; the deck is the only thing at stake and the device is already
 * theirs. Sign out on /wer is the escape hatch for a shared laptop.
 */
export const SESSION_TTL_DAYS = 3650;

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

/*
 * normaliseEmail() stood here. Its only caller was createUser's `email`
 * parameter, which nothing ever passed — there has been no address to
 * normalise since sign-in became a username and a password. See accounts.ts.
 */

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
}

// ------------------------------------------------------------- rate limiting

/**
 * Failed sign-ins per username. A password box without this is guessable at
 * whatever rate the network allows.
 *
 * In memory, so it resets on restart and does not survive more than one process.
 * That is the honest limit and it is the right trade here: the alternative is a
 * write to SQLite on every wrong password, which is a denial-of-service lever
 * pointed at the disk. Keyed on the username, because that is what is under
 * attack — an IP is trivially changed.
 */
const ATTEMPTS = new Map<string, { n: number; until: number }>();
export const MAX_ATTEMPTS = 8;
export const LOCKOUT_MS = 5 * 60_000;

/** Milliseconds still to wait, or 0 when the door is open. */
export function lockedFor(username: string): number {
  const hit = ATTEMPTS.get(username);
  if (!hit || hit.n < MAX_ATTEMPTS) return 0;
  const left = hit.until - Date.now();
  if (left <= 0) {
    ATTEMPTS.delete(username);
    return 0;
  }
  return left;
}

export function recordFailure(username: string) {
  const hit = ATTEMPTS.get(username) ?? { n: 0, until: 0 };
  hit.n += 1;
  hit.until = Date.now() + LOCKOUT_MS;
  ATTEMPTS.set(username, hit);
}

export function clearFailures(username: string) {
  ATTEMPTS.delete(username);
}
