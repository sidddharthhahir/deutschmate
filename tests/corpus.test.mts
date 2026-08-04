/**
 * Does the sentence corpus actually rotate?
 *
 * This is the failure mode that hides best. The Hören and Sätze-bauen blocks
 * always had sentences in them, always looked full, and always worked — they
 * were simply the same hundred sentences for seven months. The comment on the
 * code said it "walks the whole corpus over time instead of replaying the first
 * rows", and the cursor was `id > 'tat-' + (dayIndex % 36)`: base-36 landing
 * points on ids that are not evenly distributed (941 of 1,827 sentences start
 * with `tat-1`), and a modulo that made day 36 identical to day 0.
 *
 * So this measures coverage over a real course length rather than checking that
 * two consecutive days differ — which the broken version also passed.
 *
 * needs: seeded database
 */
import { ok, eq, section, done, open } from "./harness.mts";

const LEVELS = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2"];
const db = open();

/** The query lib/session.ts runs, driven directly across a run of days. */
function walk(level: string, limit: number, days: number) {
  const levels = LEVELS.slice(0, LEVELS.indexOf(level) + 1);
  const ph = levels.map(() => "?").join(",");
  const pool = db
    .prepare(`SELECT COUNT(*) AS n FROM sentence WHERE level IN (${ph})`)
    .get(...levels) as { n: number };
  const page = db.prepare(
    `SELECT id FROM sentence WHERE level IN (${ph}) ORDER BY id LIMIT ? OFFSET ?`,
  );

  const seen = new Set<string>();
  const perDay: string[] = [];
  for (let d = 0; d < days; d++) {
    const offset = (d * limit) % Math.max(1, pool.n);
    const rows = page.all(...levels, limit, offset) as { id: string }[];
    const wrapped =
      rows.length < limit
        ? (page.all(...levels, limit - rows.length, 0) as { id: string }[])
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
ok(long.perDay[0] !== long.perDay[36], "day 36 differs from day 0", long.perDay[0]?.slice(0, 40));
ok(long.perDay[1] !== long.perDay[37], "day 37 differs from day 1");

section("the last page wraps instead of coming up short");
const pool = (db.prepare("SELECT COUNT(*) AS n FROM sentence WHERE level = 'A1.1'").get() as {
  n: number;
}).n;
const lastDay = Math.floor(pool / 8); // an offset that runs off the end
const tail = walk("A1.1", 8, lastDay + 1).perDay[lastDay];
eq(tail.split(",").length, 8, "a full block on the day the window overruns");

db.close();
done();
