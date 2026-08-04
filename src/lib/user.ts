import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { USER_COOKIE } from "./who.ts";
import { mayActAsAnyone } from "./trust.ts";
import { SESSION_COOKIE, userIdForSession } from "./auth.ts";
import { createUser, userById, type User } from "./accounts.ts";

/**
 * Who you are, and how the app knows.
 *
 * IT USED TO TAKE YOUR WORD FOR IT. `dm_user=sid` was a readable cookie holding
 * a plain name — settable from the browser console, and until two commits ago
 * overridable by anyone who put `?user=` on a URL. Correct for two flatmates
 * sharing a laptop (spec §10) and nothing like enough for a third person.
 *
 * Identity is a signed-in session now: a random 32-byte token in an httpOnly
 * cookie, checked against its hash in the database. See lib/auth.ts.
 *
 * `dm_user` is no longer an identity; the name is display only. The rows-only
 * half of accounts lives in lib/accounts.ts, so a terminal script can use it
 * without importing `next/headers`.
 */
export { USER_COOKIE };
export type { User };
export {
  createUser,
  createUserByEmail,
  userById,
  userByEmail,
  anyUsers,
  allUsers,
  normaliseName,
} from "./accounts.ts";

/**
 * The learner this request belongs to, or null when nobody is signed in.
 *
 *   activeUser()            a page or server action — the session cookie
 *   activeUser(req)         a GET route — session, or ?user= if trusted
 *   activeUser(req, body)   a POST route — session, or body.user if trusted
 *
 * Returns null rather than throwing or redirecting, because a page and a route
 * owe an unauthenticated caller different answers: a redirect to the sign-in
 * screen, and a 401. Deciding that here would decide it wrong for half the
 * callers — and a fetch that silently followed a redirect and parsed the HTML
 * would be worse than either.
 *
 * "Trusted" is the test credential in lib/trust.ts, and is the only way an
 * explicit name is honoured at all.
 */
export async function activeUser(
  req?: Request,
  body?: Record<string, unknown>,
): Promise<User | null> {
  if (req && mayActAsAnyone(req)) {
    const fromQuery = new URL(req.url).searchParams.get("user");
    const fromBody = typeof body?.user === "string" ? body.user : null;
    const explicit = fromQuery || fromBody;
    // The trusted path may create, because that is what the tests need it for.
    if (explicit) return createUser(explicit);
  }

  try {
    const jar = await cookies();
    const id = userIdForSession(jar.get(SESSION_COOKIE)?.value);
    if (id) return userById(id) ?? null;
  } catch {
    // Called outside a request scope (a script, a build-time render).
  }
  return null;
}

/**
 * The learner, or the sign-in screen. For pages.
 *
 * `redirect()` throws, so this returns a plain User and every page keeps the
 * one line it always had — eleven call sites did not have to learn about
 * authentication.
 */
export async function requireUser(): Promise<User> {
  const u = await activeUser();
  if (!u) redirect("/anmelden");
  return u;
}
