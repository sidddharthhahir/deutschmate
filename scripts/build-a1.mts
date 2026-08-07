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
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
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
  /* The role-play. Checked by scripts/check-scenes.mts, which refuses a scene
     that uses vocabulary its unit has not taught yet. */
  scenario?: { role: string; goal: string; opener: string } | null;
  dialogue?: unknown[] | null;
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
/*
 * grammar-a2.json is in the list because four points A1.2 teaches — the dative,
 * the imperative, separable verbs and the two-way prepositions — were written
 * for A2.1 first and are reused rather than explained a second time. Leaving
 * the file out did not surface that as a warning: the ids were simply nulled,
 * and units 27, 29, 37 and 39 taught vocabulary and no rule at all. The level
 * on a grammar row gates nothing, so the reuse is safe; the mislabelling is
 * recorded in docs rather than fixed here, because moving them moves A2 too.
 */
const grammarIds = new Set<string>();
for (const f of [
  "data/grammar.json",
  "data/grammar-a1.json",
  "data/grammar-a2.json",
]) {
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

/* One pass per level. A level is emitted only when all twenty of its units have
   vocabulary — a half-written level would replace working units with empty ones. */
const LEVELS: [level: string, from: number, to: number, file: string][] = [
  ["A1.1", 1, 20, "a1-1"],
  ["A1.2", 21, 40, "a1-2"],
];

/* Examples ride in the file the seeder already applies them from, keyed by word
   id — one shape for hand-written and generated alike. */
const exFile = path.join(ROOT, "data/examples-a1-1.json");
const examples = JSON.parse(readFileSync(exFile, "utf8")) as Record<
  string,
  { de: string; en: string }
>;

for (const [level, from, to, slug] of LEVELS) {
  const ready = units.filter(
    (u) => u.level === level && haveWords.has(u.ord) && u.ord >= from,
  );
  if (ready.length !== 20) {
    console.log(
      `  ${level}: ${ready.length}/20 units written — left to the old files.`,
    );
    continue;
  }
  const mine = words.filter((w) => w.unit >= from && w.unit <= to);

  /*
   * The unit id stays the one already in the database — a1-1-u06, not the
   * readable a1-06-der-die-das from the plan. unit.ord is UNIQUE per level so a
   * new id collides with the old row, and unit_progress points at these ids, so
   * renaming silently discards what people have finished.
   */
  const dbId = (ord: number) =>
    `${slug}-u${String(ord - from + 1).padStart(2, "0")}`;
  /* Any unit in A1, not just this level's — the prerequisite chain crosses the
     boundary, and dbId(20) inside the A1.2 pass produced a1-2-u00. */
  const anyId = (ord: number) =>
    ord <= 20
      ? `a1-1-u${String(ord).padStart(2, "0")}`
      : `a1-2-u${String(ord - 20).padStart(2, "0")}`;

  writeFileSync(
    path.join(ROOT, `data/words-${slug}.json`),
    JSON.stringify(
      mine.map((w) => ({
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

  writeFileSync(
    path.join(ROOT, `data/units-${slug}.json`),
    JSON.stringify(
      ready.map((u) => ({
        id: dbId(u.ord),
        level: u.level,
        ord: u.ord - from + 1,
        title: u.title,
        can_do: u.canDo,
        words: mine.filter((w) => w.unit === u.ord).map((w) => w.id),
        grammar_id: u.grammar && grammarIds.has(u.grammar) ? u.grammar : null,
        scenario: u.scenario ?? null,
        dialogue: u.dialogue ?? null,
        /*
         * Strictly linear, and the chain crosses the level boundary: A1.2 unit
         * 1 requires A1.1 unit 20. Only unit 1 of the whole course starts free.
         * Leaving the first unit of every level unlocked let a learner who had
         * finished nothing be handed the first unit of A1.2 — the walk found it
         * available and took it before falling back.
         */
        prereq: u.ord === 1 ? [] : [anyId(u.ord - 1)],
      })),
      null,
      2,
    ) + "\n",
  );

  let wrote = 0;
  for (const w of mine) {
    if (!w.example_de || !w.example_en) continue;
    examples[w.id] = { de: w.example_de, en: w.example_en };
    wrote++;
  }

  console.log(
    `  ${level}: ${ready.length} units, ${mine.length} words, ${wrote} examples -> data/words-${slug}.json, data/units-${slug}.json`,
  );
}

/*
 * Drop examples for words nothing defines any more.
 *
 * This file is merged into, never rebuilt, so the ids from the draft the A1
 * rewrite replaced — mann, frau, montag — survived every run and the seeder
 * printed sixty of them as unknown on every seed. A warning nobody can act on
 * is a warning everybody learns to skip. Anything a word file still defines is
 * kept, including the legacy A1.2 browse words, which are not in vocab-a1.json.
 */
const defined = new Set(words.map((w) => w.id));
for (const f of readdirSync(path.join(ROOT, "data"))) {
  if (!/^words-.*\.json$/.test(f)) continue;
  for (const w of read(`data/${f}`) as { id: string }[]) defined.add(w.id);
}
const stale = Object.keys(examples).filter((id) => !defined.has(id));
for (const id of stale) delete examples[id];
if (stale.length)
  console.log(`  dropped ${stale.length} examples for words nothing defines`);

writeFileSync(exFile, JSON.stringify(examples, null, 2) + "\n");
if (missingGrammar.size) {
  console.log(
    `\n  ${missingGrammar.size} grammar points the plan names and nobody has written:\n` +
      [...missingGrammar].map((g) => `    ${g}`).join("\n") +
      "\n  Those units teach their vocabulary and no rule. Write them next.\n",
  );
}
