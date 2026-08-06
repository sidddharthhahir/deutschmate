/**
 * A session never serves grammar the course has not taught yet.
 * needs: server, seeded database
 */
import { get, ok, eq, section, done, scratchUser, open } from "./harness.mts";
import { needsUnit, reachOf } from "../src/lib/sentence-grammar.ts";

const db = open();

section("the corpus carries its grammar level, not just its word level");
/* The column is the whole point of the seeder change. If it is missing or
   uniformly 99 the gate is still "working" — it just serves nothing — and
   every assertion below would pass for the wrong reason. */
const spread = db
  .prepare(
    `SELECT MIN(needs_unit) AS lo, MAX(needs_unit) AS hi,
            SUM(needs_unit <= 20) AS a11, COUNT(*) AS n FROM sentence`,
  )
  .get() as { lo: number; hi: number; a11: number; n: number };
ok(spread.n > 0, "there are sentences", spread.n);
ok(
  spread.lo < spread.hi,
  "needs_unit varies rather than defaulting everywhere",
  `${spread.lo}..${spread.hi}`,
);
ok(
  spread.a11 > 200,
  "enough of the corpus is reachable in A1.1 to fill a block",
  `${spread.a11} sentences`,
);

section("the stored classification matches the rules");
/* Recomputed here from the German, so a stale database — seeded before a rule
   changed — is a failure rather than a quiet wrong answer. */
const sample = db
  .prepare("SELECT de, needs_unit FROM sentence ORDER BY id LIMIT 300")
  .all() as { de: string; needs_unit: number }[];
const wrong = sample.filter((s) => s.needs_unit !== needsUnit(s.de));
eq(wrong.length, 0, "300 stored values agree with the classifier");
if (wrong.length)
  console.log(
    `        first: "${wrong[0].de}" stored ${wrong[0].needs_unit}, rules say ${needsUnit(wrong[0].de)}`,
  );

section("the scale a learner is measured on");
eq(reachOf("A1.1", 1), 1, "the first day of the course is unit 1");
eq(reachOf("A1.2", 1), 21, "A1.2 unit 1 is unit 21, not unit 1 again");
eq(reachOf("A1.2", 20), 40, "the last unit of A1 is 40");
ok(reachOf("A2.1", 1) >= 99, "past A1 the gate stops gating");

// --------------------------------------------------------- through the API

/** Every corpus sentence a session actually put in front of the learner. */
function corpusIn(session: {
  blocks: { kind: string; payload?: Record<string, unknown> }[];
}): string[] {
  const out: string[] = [];
  for (const b of session.blocks) {
    const items = (b.payload?.items ?? []) as {
      de?: string;
      answer?: string;
      credit?: string | null;
    }[];
    for (const it of items) {
      /* Curated examples are hand-written against their own unit and carry no
         credit; the unit is their authority, not this rule. Corpus lines carry
         a Tatoeba credit and are exactly what the gate exists for. */
      if (!it.credit) continue;
      const de = it.de ?? it.answer;
      if (de) out.push(de);
    }
  }
  return out;
}

section("day one gets nothing it cannot read");
const NEW = scratchUser("test-gate-new");
const first = await get(`/api/session?user=${NEW}`);
const early = corpusIn(first);
const tooHard = early.filter((de) => needsUnit(de) > 1);
eq(
  tooHard.length,
  0,
  `no corpus sentence beyond unit 1 (${early.length} corpus lines offered)`,
);
if (tooHard.length) console.log(`        e.g. "${tooHard[0]}"`);
/* And the blocks are still there — an empty Sätze bauen would be the gate
   winning by deleting the lesson. */
const builder = first.blocks.find(
  (b: { kind: string }) => b.kind === "builder",
);
ok(builder, "Sätze bauen is still in the session");
ok(
  ((builder?.payload?.items ?? []) as unknown[]).length >= 5,
  "and has items, from the unit's own curated examples",
  ((builder?.payload?.items ?? []) as unknown[]).length,
);

section("a learner deeper into A1 gets more, and still nothing untaught");
const OLD = scratchUser("test-gate-far");
await get(`/api/session?user=${OLD}`); // create the user
const d2 = open();
const done20 = d2
  .prepare("SELECT id FROM unit WHERE level = 'A1.1' ORDER BY ord")
  .all() as { id: string }[];
const mark = d2.prepare(
  `INSERT INTO unit_progress (user_id, unit_id, status, completed_at)
   VALUES (?, ?, 'complete', datetime('now', '-1 days'))
   ON CONFLICT(user_id, unit_id) DO UPDATE SET status = 'complete'`,
);
for (const u of done20) mark.run(OLD, u.id);
d2.close();

const later = await get(`/api/session?user=${OLD}`);
const reach = reachOf(later.unit?.level ?? "A1.1", later.unit?.ord ?? 1);
ok(reach > 20, "the learner has moved into A1.2", `reach ${reach}`);
const lines = corpusIn(later);
const over = lines.filter((de) => needsUnit(de) > reach);
eq(
  over.length,
  0,
  `nothing above unit ${reach} (${lines.length} corpus lines)`,
);
if (over.length)
  console.log(`        e.g. "${over[0]}" needs ${needsUnit(over[0])}`);
ok(
  lines.length > early.length,
  "and there is more corpus material than on day one",
  `${early.length} → ${lines.length}`,
);

section("the sentence that started this is never served to anyone in A1");
const rel = db
  .prepare(
    `SELECT de, needs_unit FROM sentence
      WHERE de LIKE '%, der %' OR de LIKE '%, die %' LIMIT 5`,
  )
  .all() as { de: string; needs_unit: number }[];
ok(rel.length > 0, "the corpus does contain relative clauses", rel.length);
ok(
  rel.every((r) => r.needs_unit > 40),
  "and every one of them is filed beyond A1",
  rel.map((r) => r.needs_unit).join(" "),
);

db.close();
done();
