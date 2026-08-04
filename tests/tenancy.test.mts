/**
 * You cannot be somebody else.
 *
 * Until this commit you could. `activeUser(explicit)` honoured a caller-supplied
 * name unconditionally and *before* the cookie, so `?user=alex` on eight GET
 * routes and `{"user":"alex"}` in the body of twelve POST routes made you Alex —
 * no token, no check. `/wer` lists every account name, so there was nothing to
 * guess either.
 *
 * That was the documented design for two flatmates sharing a laptop (spec §10).
 * It stops being a design the moment a third person has the URL: grade someone
 * else's cards, write their streak, delete their gap sentences, read their
 * vocabulary and their mistakes — and once API keys are stored per learner,
 * spend their money.
 *
 * Every check here sends NO credential, which is the only way to test that a
 * door is shut. The rest of the suite sends one, so those two facts are proven
 * separately: the door opens for the harness, and for nobody else.
 *
 * needs: server, seeded database
 */
import { get, raw, ok, eq, section, done, scratchUser, open } from "./harness.mts";

const VICTIM = scratchUser("test-victim");
await get(`/api/session?user=${VICTIM}`); // create the account to be attacked

const db = open();
const countFor = (u: string, table: string) =>
  (
    db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(u) as { n: number }
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
eq(countFor(VICTIM, "attempt"), before.attempt, "no attempt row appeared on the victim");

await raw("/api/session", {
  method: "POST",
  body: JSON.stringify({ user: VICTIM, minutes: 99, blocks: ["review"] }),
});
eq(countFor(VICTIM, "session_log"), before.session_log, "no session was logged for them");

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
ok(!stolen?.blocks, "no session plan in the body", JSON.stringify(stolen).slice(0, 60));
eq(stolen?.signIn, "/anmelden", "and it says where to sign in");

eq((await raw(`/api/leech?user=${VICTIM}`)).status, 401, "same for /api/leech");
eq((await raw(`/api/wortschatz?user=${VICTIM}`)).status, 401, "and /api/wortschatz");

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
const unit = db.prepare("SELECT video_id FROM unit WHERE id = 'a1-1-u01'").get() as
  | { video_id: string | null }
  | undefined;
eq(unit?.video_id ?? null, null, "and the unit was not touched");
eq(
  (db.prepare("SELECT COUNT(*) AS n FROM video WHERE id = 'v-dQw4w9WgXcQ'").get() as { n: number })
    .n,
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

section("the door still opens for the harness");
/* Proving the negative above is only worth something if the positive also
   holds — otherwise every check here would pass on a server that was simply
   down. `get()` sends the credential; `raw()` above did not. */
const mine = await get(`/api/session?user=${VICTIM}`);
eq(mine?.user?.id, VICTIM, "with the credential, ?user= is honoured");

db.close();
done();
