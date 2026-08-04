/**
 * Which learner this browser is, on the client side.
 *
 * THE BUG THIS FIXES
 *
 * /wer tells both flatmates, in as many words: "nothing is shared between
 * learners except the course itself." Three things were.
 *
 *   dm.outbox.v1    grades answered offline and not yet sent
 *   dm.session.v2   the half-finished session offered as "Weiter?"
 *   dm.plan.v1      today's block list, cached so a session starts offline
 *
 * All three were stored under one global name. Switch user on /wer and the
 * saved session, the cached plan and — worst — the queue of ungraded answers
 * came along. Nothing errors: the resume offer looks right, the plan looks
 * right, and the replay lands on whoever happens to hold the cookie when the
 * network returns. One person's reviews, scheduled into the other person's
 * deck, silently.
 *
 * The server has been keyed by user since the schema was written. Only the
 * browser half was not.
 *
 * The cookie is deliberately not httpOnly (see lib/user.ts) precisely so the
 * client can read it — this is not auth, it is a name.
 */

/** Must match DEFAULT_USER in lib/user.ts. */
export const DEFAULT_USER = "sid";

export const USER_COOKIE = "dm_user";

/**
 * The session token. httpOnly — the browser cannot read it, and neither can
 * this module; it is named here only so the middleware can check the cookie
 * EXISTS without importing lib/auth.ts, which pulls in node:sqlite and cannot
 * run in the edge runtime.
 */
export const SESSION_COOKIE = "dm_session";

/**
 * The learner id, readable by the browser on purpose.
 *
 * Not a credential — it proves nothing and grants nothing. The session cookie
 * is httpOnly, so the client cannot see who it is, and every localStorage key
 * below is namespaced per learner. This is how the browser knows which bucket
 * is its own without being told a secret.
 */
export const UID_COOKIE = "dm_uid";

/** Same normalisation as the server, so a key never disagrees with a row. */
export function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || DEFAULT_USER;
}

/** Pure so the scoping rule can be tested without a browser. */
export function scoped(base: string, user: string): string {
  return `${base}:${normalise(user)}`;
}

/** Read the name out of a cookie string. Exported for the test. */
export function userFromCookie(cookie: string): string {
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === USER_COOKIE) return normalise(decodeURIComponent(v.join("=")));
  }
  return DEFAULT_USER;
}

/** Who this browser currently is. Falls back rather than throwing on the server. */
export function whoami(): string {
  if (typeof document === "undefined") return DEFAULT_USER;
  return userFromCookie(document.cookie);
}

/** A localStorage key belonging to whoever is using the browser right now. */
export function myKey(base: string): string {
  return scoped(base, whoami());
}
