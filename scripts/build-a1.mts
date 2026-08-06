/**
 * Turn the hand-written A1 plan into the files the seeder already reads.
 *
 *   data/curriculum-a1.json  the teaching order
 *   data/vocab-a1.json       the words, in that order
 *        ->  data/words-a1-1.json   and   data/units-a1-1.json
 *
 * Generated rather than hand-maintained in two places, so the plan and the seed
 * cannot drift. Only the levels that are actually written are emitted — A1.2 is
 * left to the old files until its vocabulary exists.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f: string) =>
  JSON.parse(readFileSync(path.join(ROOT, f), "utf8"));

type Unit = {
  ord: number;
  level: string;
  id: string;
  title: string;
  canDo: string[];
  grammar: string | null;
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

const { units } = read("data/curriculum-a1.json") as { units: Unit[] };
const { words } = read("data/vocab-a1.json") as { words: Word[] };

/*
 * unit.grammar_id is a foreign key, so a plan naming a grammar point nobody has
 * written yet cannot be seeded. Those become null and are listed — the unit
 * still teaches its vocabulary, and the gap is visible instead of blocking the
 * whole rewrite behind 26 grammar pages.
 */
const grammarIds = new Set<string>();
for (const f of ["data/grammar.json", "data/grammar-a1.json"]) {
  try {
    for (const g of read(f) as { id: string }[]) grammarIds.add(g.id);
  } catch {
    /* not every file exists */
  }
}
const missingGrammar = new Set(
  units
    .filter((u) => u.grammar && !grammarIds.has(u.grammar))
    .map((u) => u.grammar as string),
);

/** Only units whose vocabulary is written. A unit with no words teaches nothing. */
const haveWords = new Set(words.map((w) => w.unit));
const ready = units.filter((u) => u.level === "A1.1" && haveWords.has(u.ord));

if (ready.length !== 20) {
  console.error(
    `A1.1 is ${ready.length}/20 units. Write the rest before seeding it.`,
  );
  process.exit(1);
}

const a1Words = words.filter((w) => haveWords.has(w.unit) && w.unit <= 20);

writeFileSync(
  path.join(ROOT, "data/words-a1-1.json"),
  JSON.stringify(
    a1Words.map((w) => ({
      id: w.id,
      lemma: w.lemma,
      article: w.article ?? null,
      plural: w.plural ?? null,
      pos: w.pos,
      en: w.en,
      topic: w.topic,
    })),
    null,
    2,
  ) + "\n",
);

/* Examples ride in the same file the seeder already applies them from, keyed by
   word id — one shape for hand-written and generated alike. */
const exFile = path.join(ROOT, "data/examples-a1-1.json");
const existing = JSON.parse(readFileSync(exFile, "utf8")) as Record<
  string,
  { de: string; en: string }
>;
let wrote = 0;
for (const w of a1Words) {
  if (!w.example_de || !w.example_en) continue;
  existing[w.id] = { de: w.example_de, en: w.example_en };
  wrote++;
}
writeFileSync(exFile, JSON.stringify(existing, null, 2) + "\n");

/*
 * The unit id stays the one already in the database — a1-1-u06, not the readable
 * a1-06-der-die-das from the plan. Two reasons, and neither is style: unit.ord
 * is UNIQUE per level so a new id collides with the old row, and unit_progress
 * points at these ids, so renaming them silently discards what people have
 * finished. The readable id lives in the plan, where it is documentation.
 */
const dbId = (ord: number) => `a1-1-u${String(ord).padStart(2, "0")}`;

writeFileSync(
  path.join(ROOT, "data/units-a1-1.json"),
  JSON.stringify(
    ready.map((u) => ({
      id: dbId(u.ord),
      level: u.level,
      ord: u.ord,
      title: u.title,
      can_do: u.canDo,
      words: a1Words.filter((w) => w.unit === u.ord).map((w) => w.id),
      grammar_id: u.grammar && grammarIds.has(u.grammar) ? u.grammar : null,
      scenario: null,
      dialogue: null,
      /* Strictly linear. The old A1.1 had no prerequisites at all, which is how
         a relative clause could turn up on day two. */
      prereq: u.ord === 1 ? [] : [dbId(u.ord - 1)],
    })),
    null,
    2,
  ) + "\n",
);

console.log(
  `A1.1: ${ready.length} units, ${a1Words.length} words, ${wrote} examples ->` +
    " data/words-a1-1.json, data/units-a1-1.json, data/examples-a1-1.json",
);
if (missingGrammar.size) {
  console.log(
    `\n  ${missingGrammar.size} grammar points the plan names and nobody has written:\n` +
      [...missingGrammar].map((g) => `    ${g}`).join("\n") +
      "\n  Those units teach their vocabulary and no rule. Write them next.\n",
  );
}
