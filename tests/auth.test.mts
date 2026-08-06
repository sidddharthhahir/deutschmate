/**
 * Sessions and the sign-in door.
 * needs: server
 */
import { ok, eq, section, done, BASE } from "./harness.mts";
import {
  createSession,
  userIdForSession,
  destroySession,
  destroyAllSessions,
  SESSION_TTL_DAYS,
  lockedFor,
  recordFailure,
  clearFailures,
  MAX_ATTEMPTS,
} from "../src/lib/auth.ts";
import { hashPassword, verifyPassword } from "../src/lib/password.ts";
import {
  createUserWithPassword,
  credentialsFor,
  userByName,
} from "../src/lib/accounts.ts";
import { run } from "../src/lib/db.ts";

const NAME = `t-auth-${Date.now().toString(36)}`;
const PASS = "ein gutes passwort";

section("a session names its learner, and only while it lives");
const u = createUserWithPassword(NAME, hashPassword(PASS), "x".repeat(64))!;
ok(u, "the account was made");
const s = createSession(u.id);
eq(userIdForSession(s.value), u.id, "a fresh session resolves to its learner");
eq(userIdForSession("nonsense"), null, "a made-up value does not");
eq(userIdForSession(undefined), null, "no cookie does not");
eq(userIdForSession(""), null, "an empty cookie does not");

section("the session lasts long enough that a device never asks again");
ok(SESSION_TTL_DAYS >= 3650, "ten years or more", `${SESSION_TTL_DAYS} days`);
const days = Math.round((s.expiresAt.getTime() - Date.now()) / 86_400_000);
ok(days >= 3649, "and the cookie it issues says so too", `${days} days`);

section("signing out ends it");
destroySession(s.value);
eq(userIdForSession(s.value), null, "the session is gone after sign-out");

section("sign out everywhere");
const a = createSession(u.id);
const b = createSession(u.id);
ok(userIdForSession(a.value) && userIdForSession(b.value), "two devices");
destroyAllSessions(u.id);
ok(
  !userIdForSession(a.value) && !userIdForSession(b.value),
  "both are gone — a password reset must not leave old devices signed in",
);

section("the stored password is a hash and it verifies");
const creds = credentialsFor(u.id)!;
ok(creds.password_hash, "there is one");
ok(!creds.password_hash!.includes(PASS), "the password itself is not stored");
ok(verifyPassword(PASS, creds.password_hash), "the right password verifies");
ok(
  !verifyPassword("etwas anderes", creds.password_hash),
  "a wrong one does not",
);

section("an account with no password cannot be signed into");
run("UPDATE user SET password_hash = NULL WHERE id = ?", u.id);
ok(
  !verifyPassword(PASS, credentialsFor(u.id)!.password_hash),
  "a null hash is not a password anyone can guess",
);
run("UPDATE user SET password_hash = ? WHERE id = ?", hashPassword(PASS), u.id);

section("wrong passwords lock the username, not the whole install");
clearFailures(NAME);
eq(lockedFor(NAME), 0, "open to begin with");
for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailure(NAME);
ok(lockedFor(NAME) > 0, "locked after the limit", `${MAX_ATTEMPTS} tries`);
eq(lockedFor("somebody-else"), 0, "a different username is unaffected");
clearFailures(NAME);
eq(lockedFor(NAME), 0, "a correct password clears it");

section("the route itself");
async function post(body: unknown) {
  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
}

const wrong = await post({
  action: "signin",
  username: NAME,
  password: "falsch",
});
eq(wrong.status, 401, "a wrong password is refused");
ok(!("recoveryCode" in wrong.body), "and gives nothing away");

const missing = await post({
  action: "signin",
  username: `no-such-${Date.now()}`,
  password: "irgendwas",
});
eq(missing.status, 401, "an unknown username is refused");
eq(
  missing.body.error,
  wrong.body.error,
  "with the identical message — otherwise this lists who has an account",
);

clearFailures(NAME);
const good = await post({ action: "signin", username: NAME, password: PASS });
eq(good.status, 200, "the right password is accepted");
ok(good.body.ok === true, "and says so");

section("register refuses a name that is taken");
const dupe = await post({
  action: "register",
  username: NAME,
  password: "noch ein passwort",
});
eq(dupe.status, 400, "no second account on the same username");
ok(
  verifyPassword(PASS, credentialsFor(u.id)!.password_hash),
  "and the existing account's password is untouched",
);

run("DELETE FROM session WHERE user_id = ?", u.id);
run("DELETE FROM user WHERE id = ?", u.id);
ok(!userByName(NAME), "cleaned up after itself");

done();
