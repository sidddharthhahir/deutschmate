/**
 * When may a request claim to be somebody else?
 *
 * THE HOLE THIS CLOSES
 *
 * `activeUser(explicit)` honoured an explicit name unconditionally and before
 * the cookie, so `?user=alex` on eight GET routes and `{"user":"alex"}` in the
 * body of twelve POST routes made the caller Alex. No token, no check, nothing.
 * `/wer` lists every account name, so you did not even have to guess one.
 *
 * With two flatmates on one laptop that was the documented design (spec §10:
 * "anyone with the laptop can switch to anyone"). The moment a third person has
 * the URL it is: grade someone else's cards, write their streak, delete their
 * gap sentences, read their vocabulary and their mistakes — and once API keys
 * are stored per user, spend their money.
 *
 * WHY NOT JUST DELETE THE PARAMETER
 *
 * Six test suites drive throwaway learners through `?user=test-recycle`, which
 * is the right way to test a multi-user app: isolation by user id is exactly
 * how the app separates two people, so the tests use the real mechanism rather
 * than a mock of it.
 *
 * So impersonation survives, behind a shared secret that has to be deliberately
 * configured. `npm run setup` writes a random one into `.env.local`, Next loads
 * it for the dev server, and the harness reads the same file. A deployment that
 * does not set it cannot be impersonated at all, because the check fails closed:
 * no variable, no trust.
 *
 * NOT AUTHENTICATION. This is a test-fixture door with a lock on it. Real
 * accounts are the next step; this exists so that step is not urgent.
 */

/** Sent by the test harness. Named so it is obvious in a log what it is. */
export const TEST_HEADER = "x-deutschmate-test-auth";

/** The env var holding the shared secret. Absent in any normal deployment. */
export const TEST_ENV = "DEUTSCHMATE_TEST_AUTH";

/**
 * Long enough that it cannot be guessed and cannot be set to something weak by
 * accident. A four-character token in a config file reads as configured and is
 * not.
 */
export const MIN_TOKEN = 24;

/**
 * True when this request carries the shared secret.
 *
 * Fails closed on every path: no request, no configured token, a token too
 * short to be meaningful, or a mismatch.
 */
export function mayActAsAnyone(req?: Request): boolean {
  const expected = process.env[TEST_ENV];
  if (!req || !expected || expected.trim().length < MIN_TOKEN) return false;
  return req.headers.get(TEST_HEADER) === expected.trim();
}

/**
 * Whether the admin tools may write.
 *
 * `POST /api/video` had no user resolution and no check of any kind, and it
 * runs `UPDATE unit SET video_id = ? WHERE id = ?` — an unauthenticated write
 * to the *shared content* every learner reads. It is an operator tool for a
 * machine with the repo on it, so it gets an operator switch: off unless the
 * env says otherwise.
 *
 * Deliberately a switch and not a password, and the code says so rather than
 * implying more safety than it has. It stops the accidental and the drive-by;
 * it is not a defence against someone who can already set your environment.
 */
export function adminEnabled(): boolean {
  return process.env.DEUTSCHMATE_ADMIN === "1";
}
