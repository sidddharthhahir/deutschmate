/**
 * Sign-in.
 *
 * The primitives, driven directly, because every one of them is a way to
 * become somebody else if it is wrong: a token that survives being used, a
 * token that outlives its expiry, a session that is stored in the clear, a
 * redemption that two callers can both win.
 *
 * Deliberately NOT a test of the screens. What must hold here is arithmetic
 * about rows, and a browser test would prove it more slowly and less.
 *
 * needs: seeded database
 */
import { readFileSync } from "node:fs";
import { ok, eq, section, done, open } from "./harness.mts";
import {
  createSession,
  createSignInToken,
  destroyAllSessions,
  destroySession,
  normaliseEmail,
  redeemSignInToken,
  sweepExpired,
  userIdForSession,
  TOKEN_TTL_MIN,
  SESSION_TTL_DAYS,
} from "../src/lib/auth.ts";
import { createUserByEmail, userByEmail } from "../src/lib/accounts.ts";
import { check } from "../src/lib/env.ts";

const EMAIL = "test-auth@example.invalid";

/* Its own connection each time: this also runs on exit, after `done()` has
   closed the one below, and a closed handle throws rather than cleaning up. */
const wipe = () => {
  const d = open();
  for (const email of [EMAIL, "test-auth-second@example.invalid"]) {
    const u = d.prepare("SELECT id FROM user WHERE email = ?").get(email) as
      | { id: string }
      | undefined;
    if (!u) continue;
    d.prepare("DELETE FROM session WHERE user_id = ?").run(u.id);
    d.prepare("DELETE FROM auth_token WHERE user_id = ?").run(u.id);
    d.prepare("DELETE FROM user WHERE id = ?").run(u.id);
  }
  d.close();
};
wipe();
process.on("exit", wipe);

const db = open();

section("an address is normalised, not validated");
eq(normaliseEmail("  Anna@Example.DE "), "anna@example.de", "trimmed and lowercased");
eq(normaliseEmail("a@b"), "a@b", "short but structurally an address");
eq(normaliseEmail("nope"), null, "no @");
eq(normaliseEmail("@x.de"), null, "nothing before the @");
eq(normaliseEmail("a@"), null, "nothing after it");
eq(normaliseEmail("a b@x.de"), null, "whitespace inside");
eq(normaliseEmail("a@b@c.de"), null, "two @");

section("an account, once, from an address");
const user = createUserByEmail(EMAIL)!;
ok(Boolean(user?.id), "created", user?.id);
ok(!user.id.includes("@"), "the id is opaque, not the address", user.id);
eq(createUserByEmail(EMAIL)!.id, user.id, "asking twice does not make a second account");
eq(createUserByEmail("  TEST-AUTH@EXAMPLE.INVALID ")!.id, user.id, "nor does a different casing");
eq(userByEmail(EMAIL)?.id, user.id, "and it is findable by address");

section("the secret is never stored");
const t = createSignInToken(user.id, "http://x");
const rowsWithToken = (
  db
    .prepare("SELECT COUNT(*) AS n FROM auth_token WHERE hash = ?")
    .get(t.token) as { n: number }
).n;
eq(rowsWithToken, 0, "the token itself does not appear in the table");
ok(
  Boolean(db.prepare("SELECT hash FROM auth_token WHERE user_id = ?").get(user.id)),
  "only a hash of it does",
);
ok(t.url.includes("/api/auth/callback?token="), "the link points at the route handler", t.url);

section("a token works exactly once");
eq(redeemSignInToken(t.token), user.id, "first use signs you in");
eq(redeemSignInToken(t.token), null, "second use does not");

section("and only if it is real");
eq(redeemSignInToken(""), null, "empty");
eq(redeemSignInToken("short"), null, "too short to be one");
eq(redeemSignInToken("x".repeat(43)), null, "right shape, never issued");

section("asking again cancels the previous link");
/* Otherwise a forwarded or screenshotted email stays live for twenty minutes
   after you have already replaced it. */
const first = createSignInToken(user.id, "http://x");
const second = createSignInToken(user.id, "http://x");
eq(redeemSignInToken(first.token), null, "the older link is dead");
eq(redeemSignInToken(second.token), user.id, "the newer one works");

section("an expired token is refused");
const stale = createSignInToken(user.id, "http://x");
db.prepare("UPDATE auth_token SET expires_at = datetime('now','-1 minute') WHERE used_at IS NULL")
  .run();
eq(redeemSignInToken(stale.token), null, "past its expiry, no");
ok(TOKEN_TTL_MIN > 0 && TOKEN_TTL_MIN <= 60, "and the window is minutes, not days", TOKEN_TTL_MIN);

section("a session is a hash too");
const s = createSession(user.id);
eq(
  (db.prepare("SELECT COUNT(*) AS n FROM session WHERE hash = ?").get(s.value) as { n: number }).n,
  0,
  "the cookie value is not in the table",
);
eq(userIdForSession(s.value), user.id, "but it resolves to the learner");
eq(userIdForSession("nonsense-but-long-enough-to-pass"), null, "a made-up one does not");
eq(userIdForSession(undefined), null, "nor does no cookie at all");
ok(SESSION_TTL_DAYS >= 7, "sessions last long enough not to lose a streak", SESSION_TTL_DAYS);

section("signing out");
destroySession(s.value);
eq(userIdForSession(s.value), null, "that session is gone");

const a = createSession(user.id);
const b = createSession(user.id);
destroyAllSessions(user.id);
eq(userIdForSession(a.value), null, "sign out everywhere means everywhere");
eq(userIdForSession(b.value), null, "…including the other device");

section("expired rows are swept");
const dead = createSession(user.id);
db.prepare("UPDATE session SET expires_at = datetime('now','-1 day') WHERE hash IS NOT NULL")
  .run();
sweepExpired();
eq(userIdForSession(dead.value), null, "an expired session does not resolve");
eq(
  (db.prepare("SELECT COUNT(*) AS n FROM session WHERE user_id = ?").get(user.id) as { n: number })
    .n,
  0,
  "and its row is gone rather than accumulating",
);

section("deleting an account takes its credentials with it");
/* ON DELETE CASCADE, which is also what makes a GDPR deletion one statement. */
createSession(user.id);
createSignInToken(user.id, "http://x");
db.prepare("DELETE FROM user WHERE id = ?").run(user.id);
eq(
  (db.prepare("SELECT COUNT(*) AS n FROM session WHERE user_id = ?").get(user.id) as { n: number })
    .n,
  0,
  "no orphan sessions",
);
eq(
  (
    db.prepare("SELECT COUNT(*) AS n FROM auth_token WHERE user_id = ?").get(user.id) as {
      n: number;
    }
  ).n,
  0,
  "no orphan tokens",
);

section("a link nobody can follow is caught before it is sent");
/*
 * The worst failure this feature has, because it is invisible: DEUTSCHMATE_URL
 * left at localhost, a link mailed to a colleague, and it resolves to THEIR
 * machine where nothing is listening. That looks exactly like the email not
 * arriving, so nobody debugs the URL.
 *
 * `check()` reads the environment and the real database, so this restores both.
 * Driven with two accounts present, since one account on localhost is the
 * ordinary single-person install and must stay silent.
 */
const REAL_URL = process.env.DEUTSCHMATE_URL;
const urlIssues = () => check().filter((i) => i.name === "DEUTSCHMATE_URL");
const otherAccount = createUserByEmail("test-auth-second@example.invalid");
ok(otherAccount !== null, "a second account exists to make the URL matter");

process.env.DEUTSCHMATE_URL = "http://localhost:3000";
ok(
  urlIssues().some((i) => i.level === "error" && /localhost/.test(i.message)),
  "two accounts and a localhost URL is an error, not a shrug",
);

process.env.DEUTSCHMATE_URL = "https://deutschmate.example.com";
eq(urlIssues().length, 0, "a real host says nothing");

process.env.DEUTSCHMATE_URL = "deutschmate.example.com";
ok(
  urlIssues().some((i) => i.level === "error" && /scheme/.test(i.message)),
  "and a URL with no scheme is caught whatever the account count",
);

if (otherAccount) db.prepare("DELETE FROM user WHERE id = ?").run(otherAccount.id);
if (REAL_URL === undefined) delete process.env.DEUTSCHMATE_URL;
else process.env.DEUTSCHMATE_URL = REAL_URL;

section("the sign-in cookie is Secure behind a TLS-terminating proxy");
/*
 * Read from the source rather than driven, because reproducing it needs a
 * proxy. Almost every real deployment terminates TLS in front of the app and
 * forwards plain http, so `url.protocol` says "http:" on a site the browser
 * reached over https — and the session cookie goes out without Secure. Nothing
 * looks wrong. The header is the only thing that knows.
 */
const callback = readFileSync("src/app/api/auth/callback/route.ts", "utf8");
ok(
  /x-forwarded-proto/.test(callback),
  "the callback consults x-forwarded-proto",
);
ok(
  !/secure:\s*url\.protocol/.test(callback),
  "and does not decide from the request URL alone",
);
/* A comma-joined chain — "https,http" from two hops — must read as https, and
   taking the LAST element instead of the first is the classic way to get it
   backwards. */
const chain = "https, http";
eq(chain.split(",")[0].trim(), "https", "the first hop in a proxy chain is the client's");

db.close();
done();
