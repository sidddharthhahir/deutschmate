/**
 * Seed the content half of the database.
 *
 *   node scripts/seed.mts            # words only
 *   node scripts/seed.mts --audio    # words + fetch native audio from Commons
 *
 * Uses .mts so Node always treats it as ESM regardless of package.json "type".
 * No build step: Node 24 strips the types itself.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { applySchema, DB_PATH } from "../src/lib/db.ts";

const ROOT = process.cwd();

type Raw = {
  id: string;
  lemma: string;
  article?: string;
  plural?: string;
  pos: string;
  en: string;
  topic?: string;
  forms?: Record<string, string>;
};

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA busy_timeout = 10000"); // dev server may hold the db open

// The app's own two-pass apply (tables -> migrations -> indexes), imported
// rather than re-implemented. This used to be a copy, and a copy of a schema
// loader is a copy that will eventually disagree with the running server about
// what the schema is — including which migrations have been applied.
applySchema(db, readFileSync(path.join(ROOT, "src/lib/schema.sql"), "utf8"));

/**
 * Word files, in level order. Anything produced by import-words.mts drops in
 * here and is picked up automatically — the pipeline scales to the full
 * 2,400-word Goethe A1+A2+B1 set without touching this script again.
 */
const WORD_FILES: [file: string, level: string][] = [
  ["data/words-a1-1.json", "A1.1"],
  ["data/words-a1-2.json", "A1.2"],
  ["data/words-a2-1.json", "A2.1"],
  ["data/words-a2-2.json", "A2.2"],
  ["data/words-b1-1.json", "B1.1"],
  ["data/words-b1-2.json", "B1.2"],
];

const words: (Raw & { level: string })[] = [];
const seenIds = new Set<string>();
let dupes = 0;
for (const [file, lvl] of WORD_FILES) {
  const full = path.join(ROOT, file);
  if (!existsSync(full)) continue;
  const batch: Raw[] = JSON.parse(readFileSync(full, "utf8"));
  for (const w of batch) {
    // Files are processed in level order, so first occurrence wins: a word that
    // appears in both A1.2 and A2.1 belongs at A1.2. Without this the later
    // (harder) level would silently overwrite the earlier one and the word
    // would vanish from the beginner curriculum.
    if (seenIds.has(w.id)) {
      dupes++;
      continue;
    }
    seenIds.add(w.id);
    words.push({ ...w, level: lvl });
  }
}
if (!words.length) {
  console.error("No word files found. Expected at least data/words-a1-1.json");
  process.exit(1);
}

// ---------------------------------------------------------------- insert
const upsert = db.prepare(`
  INSERT INTO word (id, lemma, article, plural, pos, en, level, topic, forms_json, freq_rank)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    lemma=excluded.lemma, article=excluded.article, plural=excluded.plural,
    pos=excluded.pos, en=excluded.en, level=excluded.level,
    topic=excluded.topic, forms_json=excluded.forms_json
`);

db.exec("BEGIN");
words.forEach((w, i) => {
  upsert.run(
    w.id,
    w.lemma,
    w.article ?? null,
    w.plural ?? null,
    w.pos,
    w.en,
    w.level,
    w.topic ?? null,
    w.forms ? JSON.stringify(w.forms) : null,
    i + 1,
  );
});
db.exec("COMMIT");
const byLevel = words.reduce<Record<string, number>>((acc, w) => {
  acc[w.level] = (acc[w.level] ?? 0) + 1;
  return acc;
}, {});
console.log(
  `OK ${words.length} words  (${Object.entries(byLevel).map(([l, n]) => `${l}:${n}`).join("  ")})` +
    (dupes ? `  [${dupes} duplicates kept at their lowest level]` : ""),
);

// ---------------------------------------------------------------- examples
// Curated, not generated at runtime: every sentence uses only words at or below
// its own level, which is what makes the listening and builder blocks legible.
const examples: Record<string, { de: string; en: string }> = JSON.parse(
  readFileSync(path.join(ROOT, "data/examples-a1-1.json"), "utf8"),
);
const upEx = db.prepare("UPDATE word SET example_de = ?, example_en = ? WHERE id = ?");
db.exec("BEGIN");
let exCount = 0;
for (const [id, ex] of Object.entries(examples)) {
  const r = upEx.run(ex.de, ex.en, id);
  if (r.changes) exCount++;
}
db.exec("COMMIT");
console.log(`OK${exCount} example sentences`);
const noEx = Object.keys(examples).filter((k) => !words.some((w) => w.id === k));
if (noEx.length) console.warn(`  ! examples for unknown ids: ${noEx.join(", ")}`);

// ---------------------------------------------------------------- grammar
type RawGrammar = {
  id: string; slug: string; title: string; level: string; ord: number;
  explain_md: string; examples: unknown[]; drills: unknown[]; prereq: string[];
};
const GRAMMAR_FILES = [
  "data/grammar-a1.json",
  "data/grammar-a2.json",
  "data/grammar-b1.json",
];
const grammar: RawGrammar[] = GRAMMAR_FILES.filter((f) =>
  existsSync(path.join(ROOT, f)),
).flatMap((f) => JSON.parse(readFileSync(path.join(ROOT, f), "utf8")) as RawGrammar[]);
const upG = db.prepare(`
  INSERT INTO grammar (id, slug, title, level, ord, explain_md, examples_json, drills_json, prereq_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    slug=excluded.slug, title=excluded.title, level=excluded.level, ord=excluded.ord,
    explain_md=excluded.explain_md, examples_json=excluded.examples_json,
    drills_json=excluded.drills_json, prereq_json=excluded.prereq_json
`);
db.exec("BEGIN");
for (const g of grammar) {
  upG.run(g.id, g.slug, g.title, g.level, g.ord, g.explain_md,
    JSON.stringify(g.examples), JSON.stringify(g.drills), JSON.stringify(g.prereq));
}
db.exec("COMMIT");
console.log(`OK${grammar.length} grammar points`);

// ---------------------------------------------------------------- units
type RawUnit = {
  id: string; level: string; ord: number; title: string; can_do: string[];
  words: string[]; grammar_id: string | null; scenario: unknown;
  dialogue: unknown; prereq: string[];
};
// Hand-written A1.1 units first, then everything build-units.mts generated.
const UNIT_FILES = ["data/units-a1-1.json", "data/units-generated.json"];
const units: RawUnit[] = UNIT_FILES.filter((f) => existsSync(path.join(ROOT, f))).flatMap(
  (f) => JSON.parse(readFileSync(path.join(ROOT, f), "utf8")) as RawUnit[],
);
const upU = db.prepare(`
  INSERT INTO unit (id, level, ord, title, can_do_json, word_ids_json, grammar_id,
                    scenario_json, dialogue_json, prereq_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    level=excluded.level, ord=excluded.ord, title=excluded.title,
    can_do_json=excluded.can_do_json, word_ids_json=excluded.word_ids_json,
    grammar_id=excluded.grammar_id, scenario_json=excluded.scenario_json,
    dialogue_json=excluded.dialogue_json, prereq_json=excluded.prereq_json
`);
db.exec("BEGIN");
for (const u of units) {
  upU.run(u.id, u.level, u.ord, u.title, JSON.stringify(u.can_do),
    JSON.stringify(u.words), u.grammar_id, JSON.stringify(u.scenario),
    JSON.stringify(u.dialogue), JSON.stringify(u.prereq));
}
db.exec("COMMIT");
console.log(`OK${units.length} units`);

// ---------------------------------------------------------------- readings
type RawReading = {
  id: string; unit_id: string; level: string; title: string; words: number;
  text: string; questions: unknown[]; glossary: Record<string, string>;
};
const READING_FILES = [
  "data/readings-a1-1.json",
  "data/readings-a1-2.json",
  "data/readings-a2.json",
  "data/readings-b1.json",
];
const readings: RawReading[] = READING_FILES.filter((f) =>
  existsSync(path.join(ROOT, f)),
).flatMap((f) => JSON.parse(readFileSync(path.join(ROOT, f), "utf8")) as RawReading[]);
const upR = db.prepare(`
  INSERT INTO reading (id, unit_id, level, title, body, word_count, questions_json, glossary_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    unit_id=excluded.unit_id, level=excluded.level, title=excluded.title,
    body=excluded.body, word_count=excluded.word_count,
    questions_json=excluded.questions_json, glossary_json=excluded.glossary_json
`);
db.exec("BEGIN");
for (const r of readings) {
  upR.run(r.id, r.unit_id, r.level, r.title, r.text, r.words,
    JSON.stringify(r.questions), JSON.stringify(r.glossary));
  db.prepare("UPDATE unit SET reading_id = ? WHERE id = ?").run(r.id, r.unit_id);
}
db.exec("COMMIT");
console.log(`OK${readings.length} readings`);

// --------------------------------------------------------------- sentences
/* Levelled Tatoeba sentences, chosen once by scripts/import-sentences.mts and
   committed. Seeding reads the committed file, so a fresh clone needs no
   11 MB download and no network — same rule as words and readings. */
type RawSentence = {
  id: string; de: string; en: string; level: string;
  word_ids: string[]; source: string;
};
const SENTENCE_FILE = path.join(ROOT, "data/sentences.json");
if (existsSync(SENTENCE_FILE)) {
  const sentences = JSON.parse(readFileSync(SENTENCE_FILE, "utf8")) as RawSentence[];
  const upS = db.prepare(`
    INSERT INTO sentence (id, de, en, level, word_ids_json, source)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      de=excluded.de, en=excluded.en, level=excluded.level,
      word_ids_json=excluded.word_ids_json, source=excluded.source
  `);
  db.exec("BEGIN");
  for (const s of sentences) {
    upS.run(s.id, s.de, s.en, s.level, JSON.stringify(s.word_ids ?? []), s.source);
  }
  db.exec("COMMIT");
  console.log(`OK${sentences.length} sentences  (Tatoeba, CC-BY 2.0 FR)`);
} else {
  console.log("--  no data/sentences.json — run `npm run import-sentences` to build it");
}

// ---------------------------------------------------------------- videos
type RawVideo = {
  id: string; youtube_id: string; title: string; level: string;
  channel: string; unit_id: string | null; segments: unknown[];
};
const videoPath = path.join(ROOT, "data/videos.json");
if (existsSync(videoPath)) {
  const videos: RawVideo[] = JSON.parse(readFileSync(videoPath, "utf8"));
  const upV = db.prepare(`
    INSERT INTO video (id, youtube_id, title, level, channel, unit_id, segments_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      youtube_id=excluded.youtube_id, title=excluded.title, level=excluded.level,
      channel=excluded.channel, unit_id=excluded.unit_id, segments_json=excluded.segments_json
  `);
  db.exec("BEGIN");
  for (const v of videos) {
    upV.run(v.id, v.youtube_id, v.title, v.level, v.channel, v.unit_id,
      JSON.stringify(v.segments ?? []));
    if (v.unit_id) db.prepare("UPDATE unit SET video_id = ? WHERE id = ?").run(v.id, v.unit_id);
  }
  db.exec("COMMIT");
  const timestamped = videos.filter((v) => (v.segments ?? []).length).length;
  console.log(`OK${videos.length} videos (${timestamped} timestamped)`);
}

// Sanity: every word referenced by a unit must exist.
const known = new Set(words.map((w) => w.id));
const dangling = units.flatMap((u) => u.words.filter((w) => !known.has(w)));
if (dangling.length) console.warn(`  ! unknown word ids in units: ${dangling.join(", ")}`);
console.log(`  -> ${path.basename(DB_PATH)}`);

