/**
 * Fill the `sentence` table from Tatoeba.
 *
 *   node scripts/import-sentences.mts             # download (cached) + import
 *   node scripts/import-sentences.mts --stats     # what's in there now
 *   node scripts/import-sentences.mts --clear     # drop imported sentences
 *
 * WHY: the table has existed since the first schema and has always held zero
 * rows. Listening, the sentence builder and cloze all draw on the same 137
 * curated examples, so the same handful of sentences comes round forever.
 *
 * LICENCE: Tatoeba sentences are CC-BY 2.0 FR. The per-sentence contributor
 * attribution that ships with the corpus is preserved on every row's `source`
 * column rather than dropped, and the credit is shown in the UI. Nothing is
 * redistributed — the archive stays in data/tatoeba/, which is gitignored.
 *   https://tatoeba.org · https://www.manythings.org/anki/
 *
 * THE FILTER IS THE POINT. Tatoeba has 331k German-English pairs at every
 * difficulty. Importing them wholesale would hand an A1 learner Konjunktiv II.
 * A sentence is kept only when EVERY word in it is one this course teaches —
 * the same vocabulary constraint the AI tutor runs under (spec §8) — and its
 * level is the level of its hardest word. That is what turns a generic corpus
 * into levelled material.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import path from "node:path";
import { applySchema } from "../src/lib/db.ts";

const ROOT = process.cwd();
const DB_PATH = process.env.DEUTSCHMATE_DB
  ? path.resolve(process.env.DEUTSCHMATE_DB)
  : path.join(ROOT, "deutschmate.db");
const CACHE = path.join(ROOT, "data", "tatoeba");
const ZIP = path.join(CACHE, "deu-eng.zip");

const SOURCE_URL = "https://www.manythings.org/anki/deu-eng.zip";
const UA = "DeutschMate/1.0 (personal language-learning app; contact via github.com)";

const LEVELS = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2"] as const;
type Level = (typeof LEVELS)[number];

/**
 * Length bands per level, both ends.
 *
 * The maximum is obvious — a 20-word sentence is not A1 material whatever
 * words it uses. The MINIMUM turned out to matter just as much: the source
 * file is sorted shortest-first, so taking matches in file order produced a
 * corpus averaging three words ("Warum ich?", "Ich passe.") which is useless
 * as listening or builder material.
 */
const MIN_WORDS: Record<Level, number> = {
  "A1.1": 4,
  "A1.2": 5,
  "A2.1": 6,
  "A2.2": 7,
  "B1.1": 8,
  "B1.2": 9,
};

const MAX_WORDS: Record<Level, number> = {
  "A1.1": 7,
  "A1.2": 9,
  "A2.1": 11,
  "A2.2": 13,
  "B1.1": 16,
  "B1.2": 20,
};

const PER_LEVEL = 400;

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA busy_timeout = 10000");
applySchema(db, readFileSync(path.join(ROOT, "src/lib/schema.sql"), "utf8"));

const arg = (f: string) => process.argv.includes(f);

if (arg("--stats")) {
  const rows = db
    .prepare("SELECT level, COUNT(*) n FROM sentence GROUP BY level ORDER BY level")
    .all() as { level: string; n: number }[];
  const total = (db.prepare("SELECT COUNT(*) n FROM sentence").get() as { n: number }).n;
  console.log(`sentence: ${total} rows`);
  for (const r of rows) console.log(`  ${r.level}  ${r.n}`);
  process.exit(0);
}

if (arg("--clear")) {
  const before = (db.prepare("SELECT COUNT(*) n FROM sentence").get() as { n: number }).n;
  db.exec("DELETE FROM sentence WHERE source LIKE 'tatoeba%'");
  const after = (db.prepare("SELECT COUNT(*) n FROM sentence").get() as { n: number }).n;
  console.log(`sentence: ${before} -> ${after}`);
  process.exit(0);
}

// ---------------------------------------------------------------- download
mkdirSync(CACHE, { recursive: true });

if (!existsSync(ZIP)) {
  console.log(`Downloading ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    console.error(`Download failed: ${res.status} ${res.statusText}`);
    console.error(`Save the file manually to ${path.relative(ROOT, ZIP)} and re-run.`);
    process.exit(1);
  }
  writeFileSync(ZIP, Buffer.from(await res.arrayBuffer()));
}
console.log(`Archive: ${path.relative(ROOT, ZIP)} (${(statSync(ZIP).size / 1048576).toFixed(1)} MB)`);

/**
 * Read one file out of a ZIP using only node:zlib.
 *
 * The archive is a plain DEFLATE zip, which inflateRaw already handles — the
 * only missing piece is the container format, and that is fifty lines. Adding
 * an unzip dependency for a single one-off import would cost more than this.
 *
 * Entries are located through the central directory (walked back from the
 * End-Of-Central-Directory record) rather than by scanning for local headers:
 * local headers can omit the compressed size when a zip is written streaming.
 */
function readFromZip(zip: Buffer, wanted: string): Buffer {
  let eocd = -1;
  const floor = Math.max(0, zip.length - 66_000); // max comment length + header
  for (let i = zip.length - 22; i >= floor; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("not a zip: no end-of-central-directory record");

  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt central directory");
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOff = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen);

    if (name === wanted) {
      // The local header's own name/extra lengths can differ from the central
      // directory's, so re-read them at the local record.
      const lNameLen = zip.readUInt16LE(localOff + 26);
      const lExtraLen = zip.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = zip.subarray(start, start + compSize);
      if (method === 0) return raw;
      if (method === 8) return inflateRawSync(raw);
      throw new Error(`unsupported compression method ${method} for ${name}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${wanted} not found in archive`);
}

const text = readFromZip(readFileSync(ZIP), "deu.txt").toString("utf8");
const lines = text.split("\n");
console.log(`  ${lines.length.toLocaleString("de-DE")} pairs`);

// -------------------------------------------------------- vocabulary index
type Word = { id: string; lemma: string; level: string; forms_json: string | null };
const words = db.prepare("SELECT id, lemma, level, forms_json FROM word").all() as Word[];

const lower = (s: string) => s.toLocaleLowerCase("de");

/** surface form → { level index, word id }, keeping the earliest level. */
const known = new Map<string, { at: number; id: string }>();

function learn(form: string, at: number, id: string) {
  const k = lower(form);
  const prev = known.get(k);
  if (!prev || at < prev.at) known.set(k, { at, id });
}

for (const w of words) {
  const at = LEVELS.indexOf(w.level as Level);
  if (at === -1) continue;
  learn(w.lemma, at, w.id);
  // Inflected forms matter: without "geht" counting as "gehen", the filter
  // rejects nearly every real sentence.
  if (w.forms_json) {
    try {
      for (const f of Object.values(JSON.parse(w.forms_json) as Record<string, string>)) {
        if (typeof f === "string" && f) learn(f, at, w.id);
      }
    } catch {
      /* a malformed forms blob contributes nothing */
    }
  }
}

/* Closed-class words a learner meets in week one and that appear in almost
   every German sentence. Without them the filter throws away good A1 material
   whose only "unknown" token is "und". Deliberately short. */
const FUNCTION_WORDS =
  `der die das den dem des ein eine einen einem einer eines
   und oder aber denn sondern nicht kein keine keinen keinem
   ist sind bin bist seid war waren wäre hat habe hast haben hatte hatten
   ich du er sie es wir ihr mich dich sich uns euch mir dir ihm ihn ihnen
   mein meine meinen dein deine sein seine ihre unser euer
   zu in an auf mit von für aus bei nach um über unter vor
   im am zum zur ins ans beim vom
   ja nein doch sehr auch noch schon nur mal wieder immer nie
   hier da dort jetzt heute
   wie was wer wen wem wo wann warum welche welcher welches
   dass weil wenn ob als`
    .split(/\s+/)
    .filter(Boolean);

for (const f of FUNCTION_WORDS) if (!known.has(lower(f))) learn(f, 0, "");

console.log(`  ${known.size.toLocaleString("de-DE")} known forms from ${words.length} words`);

const tokens = (s: string) =>
  s
    .replace(/[.,!?;:„“"»«()[\]\-–—…]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** The level a sentence becomes readable at, or null if a word is untaught. */
function classify(de: string): { level: Level; wordIds: string[] } | null {
  const ws = tokens(de);
  if (ws.length < 2) return null;

  let hardest = 0;
  const ids = new Set<string>();
  for (const w of ws) {
    const hit = known.get(lower(w));
    if (!hit) return null;
    if (hit.at > hardest) hardest = hit.at;
    if (hit.id) ids.add(hit.id);
  }

  const level = LEVELS[hardest];
  return ws.length >= MIN_WORDS[level] && ws.length <= MAX_WORDS[level]
    ? { level, wordIds: [...ids] }
    : null;
}

/** "CC-BY 2.0 (France) Attribution: tatoeba.org #123 (x) & #456 (y)" → ids. */
function attribution(raw: string | undefined): string {
  const ids = (raw ?? "").match(/#\d+/g);
  return ids?.length ? `tatoeba ${ids.join(" & ")}` : "tatoeba";
}

// ---------------------------------------------------------------- collect
/**
 * Gather every candidate first, then choose.
 *
 * Taking the first 400 matches per level looks equivalent and is not: the
 * source file is ordered by length, so "first 400" means "the 400 shortest",
 * and the import came out averaging three words a sentence. Collecting the
 * full candidate set and sampling evenly across it gives the same count with
 * the whole length range represented.
 */
type Candidate = { key: string; de: string; en: string; credit: string; wordIds: string[] };
const pool = new Map<Level, Candidate[]>(LEVELS.map((l) => [l, []]));
const seen = new Set<string>();

for (const line of lines) {
  if (!line) continue;
  // manythings/Tatoeba order is English first, then German, then credit.
  const [en, de, credit] = line.split("\t");
  if (!de || !en) continue;
  if (de.length > 150) continue;

  const key = lower(de.trim());
  if (seen.has(key)) continue;

  const hit = classify(de);
  if (!hit) continue;

  seen.add(key);
  pool.get(hit.level)!.push({
    key,
    de: de.trim(),
    en: en.trim(),
    credit: credit ?? "",
    wordIds: hit.wordIds,
  });
}

console.log("\ncandidates per level:");
for (const l of LEVELS) console.log(`  ${l}  ${pool.get(l)!.length}`);

/** Evenly spaced picks across the list, so every length band is represented. */
function spread<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  const step = xs.length / n;
  return Array.from({ length: n }, (_, i) => xs[Math.floor(i * step)]);
}

// ---------------------------------------------------------------- import
const counts = new Map<Level, number>(LEVELS.map((l) => [l, 0]));
let kept = 0;

const insert = db.prepare(
  `INSERT INTO sentence (id, de, en, level, word_ids_json, source)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO NOTHING`,
);

/** Stable id from the text, so re-running the import changes nothing. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

db.exec("BEGIN");
try {
  for (const level of LEVELS) {
    for (const c of spread(pool.get(level)!, PER_LEVEL)) {
      counts.set(level, (counts.get(level) ?? 0) + 1);
      kept++;
      insert.run(
        `tat-${hash(c.key)}`,
        c.de,
        c.en,
        level,
        JSON.stringify(c.wordIds),
        attribution(c.credit),
      );
    }
  }
  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}

/* Write the result to data/ as well as the database.
 *
 * This is a content-generation step, like import-words: it needs an 11 MB
 * download and a corpus scan, and neither belongs in a fresh clone's setup.
 * The chosen sentences are committed, so `npm run setup` rebuilds them from
 * the repo with no network and no Tatoeba dependency at all. */
const emitted = LEVELS.flatMap((level) =>
  spread(pool.get(level)!, PER_LEVEL).map((c) => ({
    id: `tat-${hash(c.key)}`,
    de: c.de,
    en: c.en,
    level,
    word_ids: c.wordIds,
    source: attribution(c.credit),
  })),
);

writeFileSync(
  path.join(ROOT, "data", "sentences.json"),
  JSON.stringify(emitted, null, 1),
  "utf8",
);

console.log(`\nKept ${kept}:`);
for (const l of LEVELS) console.log(`  ${l}  ${counts.get(l)}`);
console.log(`\nWrote data/sentences.json — committed, so setup needs no download.`);

writeFileSync(
  path.join(CACHE, "ATTRIBUTION.txt"),
  `Sentences imported into the 'sentence' table originate from Tatoeba\n` +
    `(https://tatoeba.org) and are licensed CC-BY 2.0 FR.\n` +
    `Obtained via ${SOURCE_URL}.\n` +
    `Per-sentence contributor IDs are stored in sentence.source.\n`,
  "utf8",
);

console.log(
  `\nCC-BY 2.0 FR, Tatoeba. Contributor IDs are on every row; the credit is\n` +
    `shown in the app wherever these sentences appear.`,
);
db.close();
