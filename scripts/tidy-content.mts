/**
 * Three content repairs that were each too small for their own script.
 *
 *   node scripts/tidy-content.mts          # report only
 *   node scripts/tidy-content.mts --write  # edit data/, then re-seed
 *
 * 1. Drop words the subtitle padding brought in that a German course should
 *    not teach: English names and loans that are not German words, SI units
 *    that happen to be nouns, spellings Wiktionary itself marks obsolete,
 *    chat filler, and vulgarities. Not a tone judgement — "das Henry" is the
 *    unit of inductance and "das Be" is the flat sign.
 * 2. File each grammar point at the level of the EARLIEST unit that teaches
 *    it. Six were filed somewhere else, in both directions — a point can be
 *    reused by a later unit, so only the first one decides.
 * 3. Fold g-haben into g-sein. A1.1 unit 8 is "Sein und haben" and a unit
 *    carries one rule, so haben had been written and taught to nobody.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = process.cwd();
const D = (f: string) => path.join(ROOT, "data", f);
const write = process.argv.includes("--write");
const read = (f: string) => JSON.parse(readFileSync(D(f), "utf8"));
const save = (f: string, v: unknown) =>
  writeFileSync(D(f), JSON.stringify(v, null, 2) + "\n");

// ------------------------------------------------------------------- 1. junk
type Word = { id: string; lemma: string; en?: string; pos: string };

/* Listed one by one rather than matched by a pattern. Every rule I tried
   caught real German too — a capital letter is not evidence, since every
   German noun has one, and my first attempt flagged Zeit, Gott and Wort. */
const DROP = new Set([
  // English names and words that are not German vocabulary
  "lady",
  "madame",
  "colonel",
  "lord",
  "bob",
  "cop",
  "penny",
  "story",
  "house",
  "junior",
  "mum",
  "mom",
  "dad",
  "doctor",
  "leo",
  "henry",
  // units and symbols that happen to be nouns
  "my",
  "be",
  // Wiktionary marks these obsolete or non-standard
  // chat filler with no place in a lesson
  "wayne",
  "jo",
  "hae",
  "ha",
  "aha",
  "tja",
  "naja",
  "aehm",
  "ciao",
  // not teaching these
  "nutte",
  "fuck",
  "sex",
  "schaetzchen",
]);

const extra: Word[] = read("words-extra.json");
const kept = extra.filter((w) => !DROP.has(w.id));
const dropped = extra.filter((w) => DROP.has(w.id));
console.log(`1. junk words: dropping ${dropped.length} of ${extra.length}`);
console.log(`   ${dropped.map((w) => w.lemma).join(", ")}`);
const unmatched = [...DROP].filter((id) => !extra.some((w) => w.id === id));
if (unmatched.length)
  console.log(`   ! not in words-extra.json: ${unmatched.join(", ")}`);

/* And out of the additions map, or a unit points at a word that is gone. */
const add: Record<string, string[]> = read("unit-additions.json");
let unlinked = 0;
for (const [unit, ids] of Object.entries(add)) {
  const before = ids.length;
  add[unit] = ids.filter((id) => !DROP.has(id));
  unlinked += before - add[unit].length;
}
console.log(`   and ${unlinked} references to them in unit-additions.json`);

if (write) {
  save("words-extra.json", kept);
  save("unit-additions.json", add);
}

// --------------------------------------------------------- 2. grammar levels
const db = new DatabaseSync(path.join(ROOT, "deutschmate.db"));
const LEVELS = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2"];
const earliest = new Map<string, string>();
for (const r of db
  .prepare(
    `SELECT grammar_id AS g, level FROM unit
      WHERE grammar_id IS NOT NULL ORDER BY level, ord`,
  )
  .all() as { g: string; level: string }[]) {
  const cur = earliest.get(r.g);
  if (!cur || LEVELS.indexOf(r.level) < LEVELS.indexOf(cur))
    earliest.set(r.g, r.level);
}

console.log("\n2. grammar filed at the level that first teaches it");
let moved = 0;
for (const f of ["grammar-a1.json", "grammar-a2.json", "grammar-b1.json"]) {
  const list = read(f) as { id: string; level: string; title: string }[];
  for (const g of list) {
    const want = earliest.get(g.id);
    if (!want || want === g.level) continue;
    console.log(`   ${g.id.padEnd(22)} ${g.level} → ${want}`);
    g.level = want;
    moved++;
  }
  if (write) save(f, list);
}
console.log(`   ${moved} moved`);

// ------------------------------------------------------------- 3. sein+haben
console.log("\n3. folding haben into the unit that names it");
const a1 = read("grammar-a1.json") as {
  id: string;
  title: string;
  explain_md: string;
  examples: unknown[];
  drills: unknown[];
}[];
const sein = a1.find((g) => g.id === "g-sein");
const haben = a1.find((g) => g.id === "g-haben");
if (!sein || !haben) {
  console.log("   already merged");
} else {
  sein.title = "sein und haben — the two you cannot avoid";
  sein.explain_md =
    sein.explain_md.trimEnd() +
    "\n\n---\n\n" +
    haben.explain_md.trimEnd() +
    "\n\nThese two carry the whole language: every Perfekt sentence you will " +
    "meet later starts with one of them.";
  sein.examples = [...sein.examples, ...haben.examples];
  sein.drills = [...sein.drills, ...haben.drills];
  const merged = a1.filter((g) => g.id !== "g-haben");
  console.log(
    `   g-haben folded into g-sein (${sein.examples.length} examples, ${sein.drills.length} drills)`,
  );
  if (write) save("grammar-a1.json", merged);
}

db.close();
console.log(
  write ? "\nwritten — run `npm run seed`\n" : "\nreport only; pass --write\n",
);
