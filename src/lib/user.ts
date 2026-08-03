import { cookies } from "next/headers";
import { all, get, run } from "./db";

export type User = {
  id: string;
  name: string;
  level: string;
  daily_goal_min: number;
  browse_batch_size: number;
};

/** Which learner this browser is. Not auth — a name, per spec §10. */
export const USER_COOKIE = "dm_user";

const DEFAULT_USER = "sid";

/** Names are ids. Anything unusable falls back rather than erroring. */
export function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || DEFAULT_USER;
}

/**
 * No auth (spec §10). A name is the identity; real auth arrives at user #5.
 * Two users, shared content, separate progress — the split that matters is in
 * the schema, not in an auth provider.
 */
export function currentUser(name = DEFAULT_USER): User {
  const clean = normaliseName(name);
  let u = get<User>("SELECT * FROM user WHERE id = ?", clean);
  if (!u) {
    run("INSERT INTO user (id, name) VALUES (?, ?)", clean, clean);
    u = get<User>("SELECT * FROM user WHERE id = ?", clean)!;
    // No cards are created here. A new learner's deck is empty because they
    // have not met a word yet — see introduceWord() in srs.ts.
  }
  return u;
}

/**
 * The learner this request belongs to.
 *
 * Every server-rendered page used to hardcode "sid", so the second person on a
 * shared install saw the first person's numbers on every screen while the API
 * routes — which did honour ?user= — quietly disagreed with them. The cookie
 * is the single answer both halves now read.
 *
 * Precedence: an explicit ?user= wins (so a link can target someone), then the
 * cookie, then the default.
 */
export async function activeUser(explicit?: string): Promise<User> {
  if (explicit) return currentUser(explicit);
  try {
    const jar = await cookies();
    const name = jar.get(USER_COOKIE)?.value;
    if (name) return currentUser(name);
  } catch {
    // Called outside a request scope (a script, a build-time render).
  }
  return currentUser(DEFAULT_USER);
}

/**
 * Same, for route handlers, which can read the query string directly.
 * Async because the cookie fallback is.
 */
export async function userFromRequest(req: Request): Promise<User> {
  const explicit = new URL(req.url).searchParams.get("user");
  return activeUser(explicit ?? undefined);
}

/** Everyone with a deck on this machine — for the switcher. */
export function allUsers() {
  return all<{ id: string; name: string; level: string }>(
    "SELECT id, name, level FROM user ORDER BY id",
  );
}
