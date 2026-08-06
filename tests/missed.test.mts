/**
 * A day you skipped is a day the app admits you skipped.
 * needs: server, seeded database
 */
import { get, ok, eq, section, done, open, scratchUser } from "./harness.mts";

/*
 * Through the API rather than by importing session.ts: that file reaches
 * node:sqlite through "./db" with no extension, which Next resolves and plain
 * Node does not. Going over HTTP also means the numbers asserted here are the
 * ones a browser is actually handed.
 */
const U = scratchUser("test-missed");
await get(`/api/session?user=${U}`); // create the learner

const db = open();
const log = db.prepare(
  `INSERT INTO session_log (user_id, date, minutes, blocks_json, streak_day)
   VALUES (?, date('now', ?), 30, '[]', ?)
   ON CONFLICT(user_id, date) DO UPDATE SET streak_day = excluded.streak_day`,
);
const wipe = () =>
  db.prepare("DELETE FROM session_log WHERE user_id = ?").run(U);

/** A run of `n` consecutive days, the last of them `endedAgo` days back. */
function historyRun(n: number, endedAgo: number) {
  wipe();
  for (let i = 0; i < n; i++)
    log.run(U, `-${endedAgo + n - 1 - i} days`, i + 1);
}

/** What the home screen is handed. */
const plan = async () =>
  (await get(`/api/session?user=${U}`)) as {
    streak: number;
    missed: number;
    mode: string;
    blocks: unknown[];
  };

section("a learner who has never studied");
wipe();
let p = await plan();
eq(p.streak, 0, "no streak");
eq(p.missed, 0, "and nothing missed — there was nothing to miss");

section("studied today");
historyRun(5, 0);
p = await plan();
eq(p.streak, 5, "the streak is the run");
eq(p.missed, 0, "nothing missed");

section("studied yesterday, nothing yet today");
/* Not having started today is not a broken streak. It is the afternoon. */
historyRun(5, 1);
p = await plan();
eq(p.streak, 5, "the streak is still alive");
eq(p.missed, 0, "and no day has been lost yet");

section("one whole day skipped");
historyRun(5, 2);
p = await plan();
eq(p.streak, 0, "the streak is broken, and says so");
eq(p.missed, 1, "exactly one day missed");

section("a week away");
/*
 * The bug this file exists for. currentStreak read the last streak_day whatever
 * its date, so a learner who stopped six days ago was still told „Tag 12“ — on
 * the home screen, on /fortschritt and on every recap. Principle four of this
 * app is that it never fakes progress; a counter that keeps counting while you
 * do nothing is exactly that.
 */
historyRun(12, 6);
p = await plan();
eq(p.streak, 0, "twelve days ago is not a live streak");
eq(p.missed, 5, "five whole days lost");
eq(
  (
    db
      .prepare("SELECT MAX(streak_day) AS n FROM session_log WHERE user_id = ?")
      .get(U) as { n: number }
  ).n,
  12,
  "the run itself is still on record — only the claim about today is gone",
);

section("a missed day never costs you the session");
historyRun(4, 3);
p = await plan();
eq(p.missed, 2, "two days skipped, reported on the plan");
ok(
  p.blocks.length > 0,
  "and there is still something to do today",
  `${p.blocks.length} blocks, mode ${p.mode}`,
);

section("coming back starts at day one rather than resuming the old run");
/* logSession already had this right — it looks for yesterday's row, finds
   none, and starts again at 1. Asserted so that fixing the reading never
   tempts anyone into "restoring" the streak on the writing side too. */
historyRun(9, 4);
eq((await plan()).streak, 0, "broken before");
log.run(U, "-0 days", 1);
eq((await plan()).streak, 1, "and back at day one, not day ten");

wipe();
db.close();
done();
