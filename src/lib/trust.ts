/**
 * When may a request claim to be somebody else? Only the test harness, behind a
 * deliberately-configured shared secret. Not authentication — a test-fixture
 * door with a lock on it.
 */

/** Sent by the test harness. Named so it is obvious in a log what it is. */
export const TEST_HEADER = "x-deutschmate-test-auth";
export const TEST_ENV = "DEUTSCHMATE_TEST_AUTH";
/** A four-character token in a config file reads as configured and is not. */
export const MIN_TOKEN = 24;

/** Fails closed: no request, no token, a token too short, or a mismatch. */
export function mayActAsAnyone(req?: Request): boolean {
  const expected = process.env[TEST_ENV];
  if (!req || !expected || expected.trim().length < MIN_TOKEN) return false;
  return req.headers.get(TEST_HEADER) === expected.trim();
}

/**
 * Whether the admin tools may write. /api/video runs `UPDATE unit SET video_id`
 * — shared content every learner reads. A switch, not a password: it stops the
 * accidental and the drive-by, and nothing more.
 */
export function adminEnabled(): boolean {
  return process.env.DEUTSCHMATE_ADMIN === "1";
}
