/**
 * A signed-in session for a throwaway learner, printed as cookie assignments.
 *
 * For walking the app in a browser during development without typing a password
 * into a form. The learner is created if missing; nothing is wiped, so a probe
 * account keeps whatever progress the walk gave it.
 *
 *   node scripts/probe-cookie.mts probe
 */
import { SESSION_COOKIE, UID_COOKIE, createSession } from "../src/lib/auth.ts";
import { createUser } from "../src/lib/accounts.ts";

const name = process.argv[2] ?? "probe";
const user = createUser(name);
const { value } = createSession(user.id);
console.log(`${SESSION_COOKIE}=${value}`);
console.log(`${UID_COOKIE}=${user.id}`);
