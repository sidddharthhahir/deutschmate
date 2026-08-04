import { cookies } from "next/headers";
import { all, get, run } from "./db";
import { DEFAULT_USER, USER_COOKIE, normalise } from "./who.ts";
import { mayActAsAnyone } from "./trust.ts";

export type User = {
  id: string;
  name: string;
  level: string;
};

/**
 * The cookie name, the default learner and the name→id rule all live in
 * lib/who.ts, because the browser needs the same three answers to scope its
 * localStorage keys. Two copies of this rule would mean a key and a row could
 * disagree about who someone is.
 */
export { USER_COOKIE };

/** Names are ids. Anything unusable falls back rather than erroring. */
export const normaliseName = normalise;

/**
 * Create an account, or return it if the name is taken.
 *
 * The ONLY place a row is inserted into `user`. It used to happen inside
 * `currentUser()`, which every request calls with a caller-supplied name — so
 * `{"user":"aaa1"}` on any POST minted an account, and the next request could
 * mint another. Account creation is an act; it needs a call site that means it.
 *
 * Two of them exist: the form on /wer, and the test harness behind the shared
 * secret in lib/trust.ts.
 */
export function createUser(name: string): User {
  const clean = normaliseName(name);
  const existing = get<User>("SELECT * FROM user WHERE id = ?", clean);
  if (existing) return existing;
  run("INSERT INTO user (id, name) VALUES (?, ?)", clean, clean);
  // No cards are created here. A new learner's deck is empty because they have
  // not met a word yet — see introduceWord() in srs.ts.
  return get<User>("SELECT * FROM user WHERE id = ?", clean)!;
}

/**
 * Look up a learner by name. Never creates one.
 *
 * An unknown name falls back to the default account rather than erroring or
 * inventing: a cookie can outlive the account it names, and a half-rendered
 * page is a worse answer than the wrong deck on a two-person laptop. Once
 * sessions are signed this case disappears, because the cookie will not be a
 * name any more.
 *
 * The default account itself IS created on demand — a fresh clone has no user
 * rows at all, and the first page load has to land somewhere.
 */
export function currentUser(name = DEFAULT_USER): User {
  const clean = normaliseName(name);
  const u = get<User>("SELECT * FROM user WHERE id = ?", clean);
  if (u) return u;
  if (clean === DEFAULT_USER) return createUser(DEFAULT_USER); // bootstrap
  return currentUser(DEFAULT_USER);
}

/**
 * The learner this request belongs to.
 *
 * ONE entry point, taking the request rather than a name, because the decision
 * that got this wrong was "should I trust this string" and it was being made
 * separately at twenty call sites. Now it is made here, once.
 *
 *   activeUser()            a server-rendered page — cookie only
 *   activeUser(req)         a GET route — cookie, or ?user= if trusted
 *   activeUser(req, body)   a POST route — cookie, or body.user if trusted
 *
 * "Trusted" means the request carries the shared secret; see lib/trust.ts for
 * why that door exists at all. Without it the explicit name is ignored
 * completely — not rejected with an error, because an attacker learns nothing
 * from being told their impersonation attempt was noticed, and a legitimate
 * stale link should just show you your own data.
 */
export async function activeUser(
  req?: Request,
  body?: Record<string, unknown>,
): Promise<User> {
  if (req && mayActAsAnyone(req)) {
    const fromQuery = new URL(req.url).searchParams.get("user");
    const fromBody = typeof body?.user === "string" ? body.user : null;
    const explicit = fromQuery || fromBody;
    // The trusted path may create, because that is what the tests need it for.
    if (explicit) return createUser(explicit);
  }

  try {
    const jar = await cookies();
    const name = jar.get(USER_COOKIE)?.value;
    if (name) return currentUser(name);
  } catch {
    // Called outside a request scope (a script, a build-time render).
  }
  return currentUser(DEFAULT_USER);
}

/** Everyone with a deck on this machine — for the switcher. */
export function allUsers() {
  return all<{ id: string; name: string; level: string }>(
    "SELECT id, name, level FROM user ORDER BY id",
  );
}
