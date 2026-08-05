/** Which learner this browser is, client-side, so localStorage is namespaced per person. */

/** Only a fallback now. A signed-out browser has no learner and no buckets worth keeping. */
export const DEFAULT_USER = "sid";

/** Pre-sign-in identity. Read for one release so an open tab keeps its buckets; never written. */
export const USER_COOKIE = "dm_user";

/** httpOnly. Named here only so the edge middleware can test for it without importing node:sqlite. */
export const SESSION_COOKIE = "dm_session";

/** The learner id, readable on purpose. Proves nothing — it just says which bucket is yours. */
export const UID_COOKIE = "dm_uid";

/** Same normalisation as the server, so a key never disagrees with a row. */
export function normalise(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 32) || DEFAULT_USER
  );
}

/** Pure, so the scoping rule can be tested without a browser. */
export function scoped(base: string, user: string): string {
  return `${base}:${normalise(user)}`;
}

/** dm_uid FIRST. */
export function userFromCookie(cookie: string): string {
  let legacy: string | null = null;
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    const value = decodeURIComponent(v.join("="));
    if (k === UID_COOKIE && value) return normalise(value);
    if (k === USER_COOKIE && value) legacy = value;
  }
  return legacy ? normalise(legacy) : DEFAULT_USER;
}

/** Who this browser is. Falls back rather than throwing on the server. */
export function whoami(): string {
  if (typeof document === "undefined") return DEFAULT_USER;
  return userFromCookie(document.cookie);
}

/** A localStorage key belonging to whoever is using the browser right now. */
export function myKey(base: string): string {
  return scoped(base, whoami());
}
