/**
 * Does the sentence corpus actually rotate?
 * needs: seeded database
 */
import { ok, eq, section, done, open } from "./harness.mts";

const LEVELS = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2"];
const db = open();

/**
 * The query lib/session.ts runs, driven directly across a run of days.
 *
 * `reach` mirrors the grammar gate. Default 99 — a learner past A1, for whom
 * the gate lets everything through — so the rotation assertions below still
 * test the cursor rather than the filter.
 */
function walk(level: string, limit: number, days: number, reach = 99) {
  const levels = LEVELS.slice(0, LEVELS.indexOf(level) + 1);
  const ph = levels.map(() => "?").join(",");
  const args = [...levels, reach];
  const where = `level IN (${ph}) AND needs_unit <= ?`;
  const pool = db
    .prepare(`SELECT COUNT(*) AS n FROM sentence WHERE ${where}`)
    .get(...args) as { n: number };
  const page = db.prepare(
    `SELECT id FROM sentence WHERE ${where} ORDER BY id LIMIT ? OFFSET ?`,
  );
  const top = db.prepare(
    `SELECT id FROM sentence WHERE ${where} ORDER BY id LIMIT ?`,
  );

  const seen = new Set<string>();
  const perDay: string[] = [];
  for (let d = 0; d < days; d++) {
    const offset = (d * limit) % Math.max(1, pool.n);
    const rows = page.all(...args, limit, offset) as { id: string }[];
    // Only wrap when there is a second page to wrap to — see corpusSentences.
    const wrapped =
      rows.length < limit && pool.n > limit
        ? (top.all(...args, limit - rows.length) as { id: string }[])
        : [];
    for (const r of [...rows, ...wrapped]) seen.add(r.id);
    perDay.push([...rows, ...wrapped].map((r) => r.id).join(","));
  }
  return { seen: seen.size, pool: pool.n, perDay };
}

section("a week of listening is a week of different sentences");
const week = walk("A1.1", 8, 7);
eq(new Set(week.perDay).size, 7, "seven days, seven distinct sets");

section("the corpus is actually covered over a course, not just over a month");
/* 210 days is the planned length of the course. The old cursor's coverage was
   final by day 36 — these numbers were 102 and 105 respectively, forever. */
for (const [level, limit, floor] of [
  ["A1.1", 3, 0.9],
  ["A1.1", 8, 0.9],
  ["B1.2", 8, 0.85],
] as const) {
  const r = walk(level, limit, 210);
  const pct = r.seen / r.pool;
  ok(
    pct >= floor,
    `${level}, ${limit} per day: at least ${Math.round(floor * 100)}% of the corpus in 210 days`,
    `${r.seen}/${r.pool} = ${Math.round(pct * 100)}%`,
  );
}

section("no day is a repeat of a day five weeks earlier");
/* The specific shape of the old bug: dayIndex % 36 meant day 36 == day 0. */
const long = walk("B1.2", 8, 40);
ok(
  long.perDay[0] !== long.perDay[36],
  "day 36 differs from day 0",
  long.perDay[0]?.slice(0, 40),
);
ok(long.perDay[1] !== long.perDay[37], "day 37 differs from day 1");

section("the gate shrinks the pool without stalling the cursor");
/* The gate can cut the pool by three quarters. The cursor has to keep moving
   through what is left, or a beginner sees the same eight sentences all week —
   which is the failure the rotation work above exists to prevent, reappearing
   through a different door. */
const gated = walk("A1.1", 8, 30, 20);
ok(
  gated.pool < walk("A1.1", 8, 1).pool,
  "an A1.1 learner sees a smaller pool than an A2 one",
  `${gated.pool} of ${walk("A1.1", 8, 1).pool}`,
);
ok(gated.pool >= 8, "and it is still big enough to fill a block", gated.pool);
ok(
  new Set(gated.perDay).size >= 25,
  "30 days, at least 25 distinct sets",
  `${new Set(gated.perDay).size} distinct`,
);

section("a pool smaller than one block does not repeat itself in one day");
/* Unit 4 has five reachable sentences and the block asks for eight. Wrapping
   into a pool that small handed back the same line twice — heard, then heard
   again three items later. */
const tiny = walk("A1.1", 8, 1, 4);
const ids = tiny.perDay[0].split(",").filter(Boolean);
eq(
  ids.length,
  new Set(ids).size,
  `no sentence appears twice in one block (${ids.length} offered from a pool of ${tiny.pool})`,
);

section("the last page wraps instead of coming up short");
const pool = (
  db
    .prepare("SELECT COUNT(*) AS n FROM sentence WHERE level = 'A1.1'")
    .get() as {
    n: number;
  }
).n;
const lastDay = Math.floor(pool / 8); // an offset that runs off the end
const tail = walk("A1.1", 8, lastDay + 1).perDay[lastDay];
eq(tail.split(",").length, 8, "a full block on the day the window overruns");

db.close();
done();
