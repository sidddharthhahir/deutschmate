/**
 * Turn the hand-written A2.1 vocabulary into the two files the seeder reads.
 *
 *   data/blueprints-a2.json   the teaching order, titles, can-dos and grammar
 *   data/vocab-a2-1.json      the words, filed by unit
 *        ->  data/words-a2-1.json   and   data/units-a2-1.json
 *
 * The same shape as build-a1.mts, for the same reason: A2.1's units were filled
 * from a frequency-ordered subtitle pool, so "Im Restaurant" taught Majestät,
 * Major and Pferd while "Gesundheit" taught banking words. Generated rather
 * than hand-maintained in two places so the plan and the seed cannot drift.
 *
 *   node scripts/build-a2.mts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f: string) =>
  JSON.parse(readFileSync(path.join(ROOT, f), "utf8"));

type Blueprint = {
  level: string;
  ord: number;
  title: string;
  can_do: string[];
  grammar?: string | null;
  scenario?: unknown;
  dialogue?: unknown;
};
type Word = {
  id: string;
  lemma: string;
  article?: string;
  plural?: string;
  pos: string;
  en: string;
  topic: string;
  unit: number;
  example_de?: string;
  example_en?: string;
};

const bps = (read("data/blueprints-a2.json") as Blueprint[])
  .filter((b) => b.level === "A2.1")
  .sort((a, b) => a.ord - b.ord);
const { words } = read("data/vocab-a2-1.json") as { words: Word[] };

const written = new Set(words.map((w) => w.unit));
if (bps.length !== 20 || written.size !== 20) {
  console.log(
    `  A2.1 not complete: ${bps.length} blueprints, vocabulary for ${written.size} units. Nothing written.`,
  );
  process.exit(0);
}

/* Reuse the ids already in the database so unit_progress survives. */
writeFileSync(
  path.join(ROOT, "data/words-a2-1.json"),
  JSON.stringify(
    words.map((w) => ({
      id: w.id,
      lemma: w.lemma,
      ...(w.article ? { article: w.article } : {}),
      ...(w.plural ? { plural: w.plural } : {}),
      pos: w.pos,
      en: w.en,
      topic: w.topic,
    })),
    null,
    2,
  ) + "\n",
);

writeFileSync(
  path.join(ROOT, "data/units-a2-1.json"),
  JSON.stringify(
    bps.map((b) => ({
      id: `a2-1-u${String(b.ord).padStart(2, "0")}`,
      level: "A2.1",
      ord: b.ord,
      title: b.title,
      can_do: b.can_do,
      words: words.filter((w) => w.unit === b.ord).map((w) => w.id),
      grammar_id: b.grammar ?? null,
      scenario: b.scenario ?? null,
      dialogue: b.dialogue ?? null,
      /*
       * The chain build-units.mts was writing before this file took over:
       * each unit needs the one before it, and the first needs the last unit
       * of A1.2. Emitting [] instead unblocked a2-1-u01, and a learner whose
       * A1 units were all gated was handed A2.1 unit 1 rather than the
       * deadlock fallback — a beginner two levels up, which is the same
       * failure as being flung to the end of B1.2, just less obvious.
       */
      prereq: [
        b.ord === 1
          ? "a1-2-u20"
          : `a2-1-u${String(b.ord - 1).padStart(2, "0")}`,
      ],
    })),
    null,
    2,
  ) + "\n",
);

/* Examples ride in the file the seeder already applies them from. */
const exFile = path.join(ROOT, "data/examples-a1-1.json");
const examples = existsSync(exFile)
  ? (JSON.parse(readFileSync(exFile, "utf8")) as Record<
      string,
      { de: string; en: string }
    >)
  : {};
let wrote = 0;
for (const w of words) {
  if (!w.example_de || !w.example_en) continue;
  examples[w.id] = { de: w.example_de, en: w.example_en };
  wrote++;
}
writeFileSync(exFile, JSON.stringify(examples, null, 2) + "\n");

const per = bps.map((b) => words.filter((w) => w.unit === b.ord).length);
console.log(
  `  A2.1: 20 units, ${words.length} words, ${wrote} examples -> data/words-a2-1.json, data/units-a2-1.json`,
);
console.log(`  words per unit: ${Math.min(...per)}–${Math.max(...per)}`);
