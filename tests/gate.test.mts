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

/**
 * The input block's own items, whichever of video/reading/listening the
 * day's rhythm picked — video's curated content is the episode itself, and
 * `items` only exists on its offline fallback, so corpusIn() alone would see
 * nothing on a video day even though real content is there.
 */
function inputBlockItems(session: {
  blocks: { kind: string; payload?: Record<string, unknown> }[];
}): { kind: string; payload?: Record<string, unknown> }[] {
  const input = session.blocks.find((b) =>
    ["video", "reading", "listening"].includes(b.kind),
  );
  if (!input) return [];
  if (input.kind !== "video") return [input];
  const fallback = input.payload?.fallback as
    | { kind: string; payload?: Record<string, unknown> }
    | undefined;
  return fallback ? [fallback] : [];
}

section("day one gets nothing it cannot read");
const NEW = scratchUser("test-gate-new");
const first = await get(`/api/session?user=${NEW}`);
/*
 * All of day one's blocks, not just the input one, for the "nothing too
 * hard" check below — corpusIn() already only looks at credited (Tatoeba)
 * lines, wherever they appear.
 */
const early = corpusIn(first);
const tooHard = early.filter((de) => needsUnit(de) > 1);
eq(
  tooHard.length,
  0,
  `no corpus sentence beyond unit 1 (${early.length} corpus lines offered)`,
);
if (tooHard.length) console.log(`        e.g. "${tooHard[0]}"`);
/*
 * And the input block is still there with real content — an empty one would
 * be the gate winning by deleting the lesson.
 *
 * Not "Sätze bauen" any more: unit 1 no longer ships Builder, Speaking or
 * Gespräch at all (see session-builder.ts's `easeIn`) — reported directly
 * that day one went straight from new words into producing full sentences
 * and holding a conversation with nothing about how German sounds first. The
 * input block (video/reading/listening, whichever the day's rhythm picked)
 * is the one still guaranteed on unit 1, so that is what this checks now.
 */
const input = first.blocks.find((b: { kind: string }) =>
  ["video", "reading", "listening"].includes(b.kind),
);
ok(input, "the input block is still in the session", input?.kind);
const inputItems = (inputBlockItems(first)[0]?.payload?.items ??
  []) as unknown[];
ok(
  inputItems.length >= 5,
  "and has items, from the unit's own curated examples",
  inputItems.length,
);

section("a learner deeper into A1.1 gets more, and still nothing untaught");
/*
 * A1.1 only for now (2026-09): was "finish all of A1.1, land in A1.2" — with
 * A1.2 deliberately unseeded (see data/deferred/README.md) there is nowhere
 * to be promoted into, and currentUnit() correctly returns null for a learner
 * who has finished everything currently shipped, which is the right behaviour
 * but not a useful state for THIS test to exercise: no unit means no
 * unitWords, which means no listening/builder blocks and nothing for
 * corpusIn() to find, regardless of reach.
 *
 * So this marks only the first ten of A1.1's twelve units complete, landing
 * the learner on unit 11 (Perfekt) rather than off the end of the course —
 * still real content, still meaningfully deeper than day one.
 */
const OLD = scratchUser("test-gate-far");
await get(`/api/session?user=${OLD}`); // create the user
const d2 = open();
const done10 = d2
  .prepare("SELECT id FROM unit WHERE level = 'A1.1' ORDER BY ord LIMIT 10")
  .all() as { id: string }[];
const mark = d2.prepare(
  `INSERT INTO unit_progress (user_id, unit_id, status, completed_at)
   VALUES (?, ?, 'complete', datetime('now', '-1 days'))
   ON CONFLICT(user_id, unit_id) DO UPDATE SET status = 'complete'`,
);
for (const u of done10) mark.run(OLD, u.id);
d2.close();

const later = await get(`/api/session?user=${OLD}`);
const reach = reachOf(later.unit?.level ?? "A1.1", later.unit?.ord ?? 1);
ok(reach > 1, "the learner has moved past day one", `reach ${reach}`);
const lines = corpusIn(later);
const over = lines.filter((de) => needsUnit(de) > reach);
eq(
  over.length,
  0,
  `nothing above unit ${reach} (${lines.length} corpus lines)`,
);
if (over.length)
  console.log(`        e.g. "${over[0]}" needs ${needsUnit(over[0])}`);
/*
 * Momente's A1.1 teaches praesens and fragen from unit 1, so a brand-new
 * learner is no longer starved of corpus material the way the old, denser
 * TAUGHT_AT scale left the first eleven units — day one and a learner well
 * into A1.2 both get a full complement now, capped by the same curated-example
 * budget rather than by how much grammar has unlocked.
 *
 * Compared on the input block alone, not "all of day one's blocks" — unit 1
 * no longer ships Builder, Speaking or Gespräch (see session-builder.ts's
 * `easeIn`), so `early` above is now mostly empty for a reason that has
 * nothing to do with the sentence gate. The input block is the one both a
 * day-one and a day-eleven session actually have in common.
 */
const earlyInput = corpusIn({ blocks: inputBlockItems(first) });
ok(
  lines.length >= earlyInput.length && earlyInput.length > 0,
  "day one is no longer starved of corpus material either",
  `${earlyInput.length} → ${lines.length}`,
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
