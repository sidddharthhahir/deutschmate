/**
 * Give every word a sentence it lives in. node scripts/attach-examples.mts node
 * scripts/attach-examples.mts --stats WHY THIS MATTERS MORE THAN MORE VOCABULARY.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DB_PATH } from "../src/lib/db.ts";
import { readFromZip } from "./zip.mts";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "examples.json");
const ZIP = path.join(ROOT, "data", "tatoeba", "deu-eng.zip");

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA busy_timeout = 10000");

type Word = {
  id: string;
  lemma: string;
  level: string;
  pos: string;
  forms_json: string | null;
  example_de: string | null;
};

const LEVELS = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2"];
const lower = (s: string) => s.toLocaleLowerCase("de");
const fold = (s: string) =>
  lower(s)
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss");

const words = db
  .prepare(
    "SELECT id, lemma, level, pos, forms_json, example_de FROM word ORDER BY freq_rank",
  )
  .all() as Word[];

if (process.argv.includes("--stats")) {
  const withEx = words.filter((w) => w.example_de).length;
  console.log(`${withEx} of ${words.length} words have an example`);
  for (const lv of LEVELS) {
    const at = words.filter((w) => w.level === lv);
    console.log(
      `  ${lv}  ${at.filter((w) => w.example_de).length} / ${at.length}`,
    );
  }
  process.exit(0);
}

/** Every surface form of a word, for matching it inside a sentence. */
function formsOf(w: Word): string[] {
  const out = new Set<string>([w.lemma]);
  if (w.forms_json) {
    try {
      for (const f of Object.values(
        JSON.parse(w.forms_json) as Record<string, string>,
      )) {
        if (typeof f === "string" && f) out.add(f);
      }
    } catch {
      /* a malformed blob just contributes nothing */
    }
  }
  return [...out];
}

const tokens = (s: string) =>
  s
    .replace(/[.,!?;:„""»«()[\]–—]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const bare = (t: string) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** Does this sentence contain the word, as a whole token? */
function contains(sentence: string, forms: string[]): boolean {
  const toks = tokens(sentence).map((t) => fold(bare(t)));
  return forms.some((f) => {
    const target = fold(f);
    // Exact token, or a token beginning with the stem (Haus → Häuser).
    return toks.some(
      (t) => t === target || (target.length >= 4 && t.startsWith(target)),
    );
  });
}

// Everything the course teaches, for scoring how readable a candidate is.
const known = new Set<string>();
for (const w of words) for (const f of formsOf(w)) known.add(fold(f));

const chosen = new Map<string, { de: string; en: string; source: string }>();

// ------------------------------------------------------- pass 1: our corpus
type Sentence = { de: string; en: string; level: string; word_ids: string[] };
const corpusPath = path.join(ROOT, "data", "sentences.json");
const corpus: Sentence[] = existsSync(corpusPath)
  ? JSON.parse(readFileSync(corpusPath, "utf8"))
  : [];

const byWord = new Map<string, Sentence[]>();
for (const s of corpus) {
  for (const id of s.word_ids ?? []) {
    if (!byWord.has(id)) byWord.set(id, []);
    byWord.get(id)!.push(s);
  }
}

let fromCorpus = 0;
for (const w of words) {
  if (w.example_de) continue;
  const cands = byWord.get(w.id);
  if (!cands?.length) continue;
  // Shortest wins: an example should be readable at a glance.
  const best = [...cands].sort((a, b) => a.de.length - b.de.length)[0];
  chosen.set(w.id, { de: best.de, en: best.en, source: "corpus" });
  fromCorpus++;
}
console.log(`pass 1  ${fromCorpus} from the levelled corpus`);

// ---------------------------------------------------- pass 2: full archive
const stillMissing = words.filter((w) => !w.example_de && !chosen.has(w.id));
console.log(`        ${stillMissing.length} still without one`);

let fromArchive = 0;
if (stillMissing.length && existsSync(ZIP)) {
  console.log(`pass 2  scanning ${path.relative(ROOT, ZIP)} …`);
  const text = readFromZip(readFileSync(ZIP), "deu.txt").toString("utf8");

  // Pre-index the forms we are hunting for, so the archive is walked once.
  const hunting = stillMissing.map((w) => ({ w, forms: formsOf(w) }));
  const best = new Map<string, { de: string; en: string; score: number }>();

  for (const line of text.split("\n")) {
    if (!line) continue;
    const [en, de] = line.split("\t");
    if (!de || !en) continue;

    const toks = tokens(de);
    // Long enough to show grammar, short enough to read in one go.
    if (toks.length < 3 || toks.length > 12) continue;

    const unknown = toks.filter((t) => !known.has(fold(bare(t)))).length;
    // Score: fewer unknown neighbours and shorter is better.
    const score = unknown * 10 + toks.length;

    for (const { w, forms } of hunting) {
      const prev = best.get(w.id);
      if (prev && prev.score <= score) continue;
      if (!contains(de, forms)) continue;
      best.set(w.id, { de: de.trim(), en: en.trim(), score });
    }
  }

  for (const [id, v] of best) {
    chosen.set(id, { de: v.de, en: v.en, source: "tatoeba" });
    fromArchive++;
  }
  console.log(`        ${fromArchive} from the archive`);
} else if (stillMissing.length) {
  console.log(`pass 2  skipped — ${path.relative(ROOT, ZIP)} not present`);
  console.log(`        run \`npm run import-sentences\` once to fetch it`);
}

// ------------------------------------------------------------------ output
/*
 * Only words that had no example are searched for one, so `chosen` is this run's finds, not the
 * whole set.
 */
type Example = { id: string; de: string; en: string; source: string };
const merged = new Map<string, Example>();
/* The database is the fuller record while an already-truncated file is being
   repaired, so it goes in first and the file overwrites it where they agree. */
for (const r of db
  .prepare(
    "SELECT id, example_de, example_en FROM word WHERE example_de IS NOT NULL AND example_de <> ''",
  )
  .all() as { id: string; example_de: string; example_en: string | null }[]) {
  merged.set(r.id, {
    id: r.id,
    de: r.example_de,
    en: r.example_en ?? "",
    source: "tatoeba",
  });
}
if (existsSync(OUT)) {
  for (const e of JSON.parse(readFileSync(OUT, "utf8")) as Example[])
    merged.set(e.id, e);
}
for (const [id, v] of chosen)
  merged.set(id, { id, de: v.de, en: v.en, source: v.source });

// A word that has left the deck should not keep a row here forever.
const live = new Set(words.map((w) => w.id));
for (const id of [...merged.keys()]) if (!live.has(id)) merged.delete(id);

const payload = [...merged.values()];
writeFileSync(OUT, JSON.stringify(payload, null, 1), "utf8");

const covered = words.filter((w) => w.example_de || chosen.has(w.id)).length;
console.log(
  `\nwrote ${payload.length} examples to ${path.relative(ROOT, OUT)}  (+${chosen.size} this run)`,
);
console.log(
  `coverage now ${covered} of ${words.length} (${Math.round((covered / words.length) * 100)}%)`,
);

const left = words.filter((w) => !w.example_de && !chosen.has(w.id));
if (left.length) {
  console.log(`\nstill without an example (${left.length}):`);
  console.log(
    "  " +
      left
        .slice(0, 20)
        .map((w) => w.lemma)
        .join(", ") +
      (left.length > 20 ? " …" : ""),
  );
}
console.log(`\nRun \`npm run seed\` to apply them.`);
db.close();
