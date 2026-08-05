import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { mayActAsAnyone } from "./trust.ts";
import { SESSION_COOKIE, userIdForSession } from "./auth.ts";
import { createUser, userById, type User } from "./accounts.ts";

/** Who you are, and how the app knows. `dm_user` is no longer an identity; the name is display only. */
export type { User };
export {
  createUserByEmail,
  userByEmail,
  anyUsers,
  allUsers,
} from "./accounts.ts";

/**
 * The learner this request belongs to, or null when nobody is signed in. activeUser() a page or
 * server action — the session cookie activeUser(req) a GET route — session, or ?user= if trusted
 * activeUser(req, body) a POST route — session, or body.user if trusted Returns null rather than
 * throwing or redirecting, because a page and a route owe an unauthenticated caller different
 * answers: a redirect to the sign-in screen, and a 401.
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

/** The learner, or the sign-in screen. */
export async function requireUser(): Promise<User> {
  const u = await activeUser();
  if (!u) redirect("/anmelden");
  return u;
}
