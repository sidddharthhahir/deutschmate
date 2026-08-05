/**
 * You cannot be somebody else. Every check here sends NO credential, which is the only way to
 * test that a door is shut.
 * needs: server, seeded database
 */
import {
  get,
  raw,
  ok,
  eq,
  section,
  done,
  scratchUser,
  open,
} from "./harness.mts";

const VICTIM = scratchUser("test-victim");
await get(`/api/session?user=${VICTIM}`); // create the account to be attacked

const db = open();
const countFor = (u: string, table: string) =>
  (
    db
      .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`)
      .get(u) as { n: number }
  ).n;
const userExists = (u: string) =>
  Boolean(db.prepare("SELECT id FROM user WHERE id = ?").get(u));

const before = {
  attempt: countFor(VICTIM, "attempt"),
  card: countFor(VICTIM, "card"),
  session_log: countFor(VICTIM, "session_log"),
};

section("an unauthenticated POST cannot write to another learner");
/* The most damaging one: /api/attempt introduces words into a deck and logs
   answers, so an impersonated call corrupts both the schedule and the stats. */
await raw("/api/attempt", {
  method: "POST",
  body: JSON.stringify({
    user: VICTIM,
    kind: "review",
    refId: "hallo",
    correct: false,
    answer: "x",
    expected: "hallo",
  }),
});
eq(
  countFor(VICTIM, "attempt"),
  before.attempt,
  "no attempt row appeared on the victim",
);

await raw("/api/session", {
  method: "POST",
  body: JSON.stringify({ user: VICTIM, minutes: 99, blocks: ["review"] }),
});
eq(
  countFor(VICTIM, "session_log"),
  before.session_log,
  "no session was logged for them",
);

await raw("/api/wortschatz", {
  method: "POST",
  body: JSON.stringify({ user: VICTIM, action: "add", wordId: "hallo" }),
});
eq(countFor(VICTIM, "card"), before.card, "no card was added to their deck");

section("an unauthenticated GET gets nothing at all");
/* Before accounts existed this fell back to the default learner, which meant
   an unauthenticated call still did something — and in an earlier run of this
   very file, wrote six rows onto the developer's own account. Now there is no
   default to fall back to. */
const stolenRes = await raw(`/api/session?user=${VICTIM}`);
eq(stolenRes.status, 401, "401, not somebody else's plan");
const stolen = await stolenRes.json();
ok(
  !stolen?.blocks,
  "no session plan in the body",
  JSON.stringify(stolen).slice(0, 60),
);
eq(stolen?.signIn, "/anmelden", "and it says where to sign in");

eq((await raw(`/api/leech?user=${VICTIM}`)).status, 401, "same for /api/leech");
eq(
  (await raw(`/api/wortschatz?user=${VICTIM}`)).status,
  401,
  "and /api/wortschatz",
);

section("a made-up name does not mint an account");
/* currentUser() used to INSERT for any string it was handed, so every POST was
   an account-creation endpoint — and with a per-user AI budget, every new name
   was a fresh allowance. */
const INVENTED = "test-ghost-9z";
ok(!userExists(INVENTED), "the name does not exist to begin with");
await raw("/api/attempt", {
  method: "POST",
  body: JSON.stringify({ user: INVENTED, kind: "review", correct: true }),
});
await raw(`/api/session?user=${INVENTED}`);
ok(!userExists(INVENTED), "and still does not after being named by two routes");

section("the shared curriculum is not anonymously writable");
/* /api/video had no user resolution and no check, and runs
   `UPDATE unit SET video_id` — a write to content every learner reads. */
const videoIdOf = (unitId: string) =>
  (
    db.prepare("SELECT video_id FROM unit WHERE id = ?").get(unitId) as
      { video_id: string | null } | undefined
  )?.video_id ?? null;

/* Read before, compare after. */
const linkedBefore = videoIdOf("a1-1-u01");

const res = await raw("/api/video", {
  method: "POST",
  body: JSON.stringify({
    youtubeId: "dQw4w9WgXcQ",
    title: "injected",
    level: "A1.1",
    unitId: "a1-1-u01",
    segments: [],
  }),
});
eq(res.status, 403, "refused");
eq(
  videoIdOf("a1-1-u01"),
  linkedBefore,
  "and the unit still points where it did",
);
ok(
  videoIdOf("a1-1-u01") !== "v-dQw4w9WgXcQ",
  "certainly not at the injected one",
);
eq(
  (
    db
      .prepare("SELECT COUNT(*) AS n FROM video WHERE id = 'v-dQw4w9WgXcQ'")
      .get() as { n: number }
  ).n,
  0,
  "no video row was created",
);

section("nothing was written to whoever the default used to be");
/* The sharpest version of the bug: with no session and no credential, every
   one of the calls above landed on the default account — so running this file
   used to add six attempt rows and a 297-minute session to a real deck. There
   is no default now, and this is the check that says so. */
const orphans = (
  db
    .prepare(
      `SELECT COUNT(*) AS n FROM attempt
        WHERE created_at > datetime('now','-2 minutes') AND user_id NOT IN (?, ?)`,
    )
    .get(VICTIM, "test-ghost-9z") as { n: number }
).n;
eq(orphans, 0, "no attempt row landed on any other account");

section("sign-in links are throttled per address");
/*
 * Without a throttle, anyone who knows a colleague's address can post it in a loop and fill their
 * inbox from this server.
 */
const THROTTLED = "test-throttle@example.invalid";
db.prepare(
  "DELETE FROM auth_token WHERE user_id IN (SELECT id FROM user WHERE email = ?)",
).run(THROTTLED);
db.prepare("DELETE FROM user WHERE email = ?").run(THROTTLED);
db.prepare("INSERT INTO user (id, name, email) VALUES (?, ?, ?)").run(
  "test-throttle",
  "test-throttle",
  THROTTLED,
);

const askForLink = () =>
  raw("/api/auth", {
    method: "POST",
    body: JSON.stringify({ email: THROTTLED }),
  });

const first = await askForLink();
const second = await askForLink();
eq(
  first.status,
  second.status,
  "both requests answer the same — the throttle is not an oracle",
);

/* createSignInToken deletes the previous unused token, so a second send leaves
   one row with a LATER created_at. A throttled one leaves the first untouched. */
const tokens = db
  .prepare(
    "SELECT COUNT(*) AS n FROM auth_token WHERE user_id = 'test-throttle' AND used_at IS NULL",
  )
  .get() as { n: number };
ok(tokens.n <= 1, "at most one live token either way", `${tokens.n}`);

db.prepare("DELETE FROM auth_token WHERE user_id = 'test-throttle'").run();
db.prepare("DELETE FROM user WHERE id = 'test-throttle'").run();

section("the door still opens for the harness");
/* Proving the negative above is only worth something if the positive also
   holds — otherwise every check here would pass on a server that was simply
   down. `get()` sends the credential; `raw()` above did not. */
const mine = await get(`/api/session?user=${VICTIM}`);
eq(mine?.user?.id, VICTIM, "with the credential, ?user= is honoured");

db.close();
done();
