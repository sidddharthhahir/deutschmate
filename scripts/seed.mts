/**
 * Seed the content half of the database. node scripts/seed.mts # words only node scripts/seed.mts
 * --audio # words + fetch native audio from Commons Uses .mts so Node always treats it as ESM
 * regardless of package.json "type".
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { applySchema, DB_PATH } from "../src/lib/db.ts";
import { wordKey } from "../src/lib/error-key.ts";
import { needsUnit } from "../src/lib/sentence-grammar.ts";

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

// The app's own two-pass apply (tables -> migrations -> indexes), imported rather than
// re-implemented.
applySchema(db, readFileSync(path.join(ROOT, "src/lib/schema.sql"), "utf8"));

/** Word files, in level order. */
const WORD_FILES: [file: string, level: string][] = [
  /* First, so its gloss, article and plural win over anything else claiming the
     same id. Generated from the plan by `npm run build-a1`. */
  ["data/words-a1-1.json", "A1.1"],
  ["data/words-a1-2.json", "A1.2"],
  /*
   * The 301 words A1.2 taught before the rewrite. They are not in the new plan
   * and are not taught by any unit, but other units still reference some of
   * them, and deleting a word out from under a reference is how you get a blank
   * card. They stay in the deck as browse words. See docs: two decks.
   */
  ["data/words-a1-2-legacy.json", "A1.2"],
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
    // Files are processed in level order, so first occurrence wins: a word that appears in both
    // A1.2 and A2.1 belongs at A1.2.
    if (seenIds.has(w.id)) {
      dupes++;
      continue;
    }
    seenIds.add(w.id);
    words.push({ ...w, level: lvl });
  }
}
/* Words from import-vocab.mts carry their own level, so they are loaded after
   the hand-curated files and skipped where they duplicate one. The curated
   entry always wins — it has a checked gloss and often a written example. */
const EXTRA_WORDS = path.join(ROOT, "data/words-extra.json");
let extraCount = 0;
if (existsSync(EXTRA_WORDS)) {
  for (const w of JSON.parse(readFileSync(EXTRA_WORDS, "utf8")) as (Raw & {
    level: string;
  })[]) {
    if (seenIds.has(w.id)) {
      dupes++;
      continue;
    }
    seenIds.add(w.id);
    words.push(w);
    extraCount++;
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

/* Point every word at its recording if the file is already committed. */
const AUDIO_DIR = path.join(ROOT, "public/audio/words");
let linked = 0;
if (existsSync(AUDIO_DIR)) {
  const onDisk = new Set(
    readdirSync(AUDIO_DIR)
      .filter((f) => f.endsWith(".ogg"))
      .map((f) => f.slice(0, -4)),
  );
  const setAudio = db.prepare(
    "UPDATE word SET audio_url = ?, audio_source = 'commons' WHERE id = ?",
  );
  db.exec("BEGIN");
  for (const w of words) {
    if (onDisk.has(w.id)) {
      setAudio.run(`/audio/words/${w.id}.ogg`, w.id);
      linked++;
    }
  }
  db.exec("COMMIT");
}

/*
 * Seeding upserts, so a word dropped from the content files would otherwise sit in the deck
 * forever — that is how a stale run of import-vocab left 94 words behind that no unit taught.
 */
const stale = (
  db.prepare("SELECT id FROM word").all() as { id: string }[]
).filter((w) => !seenIds.has(w.id));
let dropped = 0;
let keptInUse = 0;
if (stale.length) {
  const studied = db.prepare(
    "SELECT 1 FROM card WHERE ref_type = 'word' AND ref_id = ? AND reps > 0 LIMIT 1",
  );
  const delCard = db.prepare(
    "DELETE FROM card WHERE ref_type = 'word' AND ref_id = ?",
  );
  const delWord = db.prepare("DELETE FROM word WHERE id = ?");
  db.exec("BEGIN");
  for (const w of stale) {
    if (studied.get(w.id)) {
      keptInUse++;
      continue;
    }
    delCard.run(w.id);
    delWord.run(w.id);
    dropped++;
  }
  db.exec("COMMIT");
}

const byLevel = words.reduce<Record<string, number>>((acc, w) => {
  acc[w.level] = (acc[w.level] ?? 0) + 1;
  return acc;
}, {});
console.log(
  `OK ${words.length} words  (${Object.entries(byLevel)
    .map(([l, n]) => `${l}:${n}`)
    .join("  ")})` +
    (dupes ? `  [${dupes} duplicates kept at their lowest level]` : "") +
    (extraCount
      ? `\n   ${extraCount} of them from Wiktionary (CC BY-SA)`
      : "") +
    (linked ? `\n   ${linked} linked to a committed recording` : "") +
    (dropped
      ? `\n   ${dropped} words no longer in the content files were removed`
      : "") +
    (keptInUse
      ? `\n   ${keptInUse} kept despite that: they already have review history`
      : ""),
);

// --------------------------------------------------------------- mnemonics
/* The other half of `npm run export-content`. */
const mnemonicPath = path.join(ROOT, "data/mnemonics.json");
if (existsSync(mnemonicPath)) {
  const parsed = JSON.parse(readFileSync(mnemonicPath, "utf8")) as {
    mnemonics?: Record<string, string>;
  };
  const entries = Object.entries(parsed.mnemonics ?? {});
  const setM = db.prepare("UPDATE word SET mnemonic = ? WHERE id = ?");
  db.exec("BEGIN");
  let applied = 0;
  for (const [id, text] of entries) {
    if (
      typeof text === "string" &&
      text.trim() &&
      setM.run(text.trim(), id).changes
    )
      applied++;
  }
  db.exec("COMMIT");
  if (entries.length) {
    console.log(
      `OK ${applied} mnemonics` +
        (applied < entries.length
          ? `  (${entries.length - applied} for words no longer here)`
          : ""),
    );
  }
}

// ---------------------------------------------------------------- examples
// Curated, not generated at runtime: every sentence uses only words at or below
// its own level, which is what makes the listening and builder blocks legible.
const examples: Record<string, { de: string; en: string }> = JSON.parse(
  readFileSync(path.join(ROOT, "data/examples-a1-1.json"), "utf8"),
);
const upEx = db.prepare(
  "UPDATE word SET example_de = ?, example_en = ? WHERE id = ?",
);
db.exec("BEGIN");
let exCount = 0;
for (const [id, ex] of Object.entries(examples)) {
  const r = upEx.run(ex.de, ex.en, id);
  if (r.changes) exCount++;
}
db.exec("COMMIT");
console.log(`OK${exCount} example sentences`);
const noEx = Object.keys(examples).filter(
  (k) => !words.some((w) => w.id === k),
);
if (noEx.length)
  console.warn(`  ! examples for unknown ids: ${noEx.join(", ")}`);

// ---------------------------------------------------------------- grammar
type RawGrammar = {
  id: string;
  slug: string;
  title: string;
  level: string;
  ord: number;
  explain_md: string;
  examples: unknown[];
  drills: unknown[];
  prereq: string[];
};
const GRAMMAR_FILES = [
  "data/grammar-a1.json",
  "data/grammar-a2.json",
  "data/grammar-b1.json",
];
const grammar: RawGrammar[] = GRAMMAR_FILES.filter((f) =>
  existsSync(path.join(ROOT, f)),
).flatMap(
  (f) => JSON.parse(readFileSync(path.join(ROOT, f), "utf8")) as RawGrammar[],
);
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
  upG.run(
    g.id,
    g.slug,
    g.title,
    g.level,
    g.ord,
    g.explain_md,
    JSON.stringify(g.examples),
    JSON.stringify(g.drills),
    JSON.stringify(g.prereq),
  );
}
db.exec("COMMIT");

/*
 * A point dropped from the content files must leave the database too.
 *
 * Seeding upserts, so g-haben survived being folded into g-sein: the file had
 * 49 and the table had 50, and the extra one was reachable from search and
 * from /grammatik with nothing teaching it. The same rule as stale words —
 * anything with review history is kept, because deleting it would take a
 * learner's card with it.
 */
const staleG = (db.prepare("SELECT id FROM grammar").all() as { id: string }[])
  .map((g) => g.id)
  .filter((id) => !grammar.some((g) => g.id === id));
let droppedG = 0;
let keptG = 0;
if (staleG.length) {
  const used = db.prepare(
    "SELECT 1 FROM card WHERE ref_type = 'grammar' AND ref_id = ? AND reps > 0 LIMIT 1",
  );
  const delG = db.prepare("DELETE FROM grammar WHERE id = ?");
  db.exec("BEGIN");
  for (const id of staleG) {
    if (used.get(id)) {
      keptG++;
      continue;
    }
    db.prepare("UPDATE unit SET grammar_id = NULL WHERE grammar_id = ?").run(
      id,
    );
    db.prepare("DELETE FROM card WHERE ref_type='grammar' AND ref_id = ?").run(
      id,
    );
    delG.run(id);
    droppedG++;
  }
  db.exec("COMMIT");
}
console.log(
  `OK${grammar.length} grammar points` +
    (droppedG
      ? `\n   ${droppedG} no longer in the content files were removed`
      : "") +
    (keptG
      ? `\n   ${keptG} kept despite that: they already have review history`
      : ""),
);

// ---------------------------------------------------------------- units
type RawUnit = {
  id: string;
  level: string;
  ord: number;
  title: string;
  can_do: string[];
  words: string[];
  grammar_id: string | null;
  scenario: unknown;
  dialogue: unknown;
  prereq: string[];
};
/*
 * Hand-written A1 units first, then everything build-units.mts generated.
 *
 * units-a1-2.json was missing from this list and therefore read by nothing:
 * build-a1 wrote it, and the seeder took A1.2 from the generated file, whose
 * grammar_id is null for every unit. Four A1.2 units — separable verbs, the
 * dative, the imperative and the two-way prepositions — taught their
 * vocabulary and no rule, while a correct file sat next to it unread.
 */
const UNIT_FILES = [
  "data/units-a1-1.json",
  "data/units-a1-2.json",
  "data/units-a2-1.json",
  "data/units-a2-2.json",
  "data/units-b1-1.json",
  "data/units-generated.json",
];
/*
 * FIRST occurrence wins, the same rule the word files use. The generated file
 * still contains A1.1 and shares its ids, and the upsert is ON CONFLICT DO
 * UPDATE — so loading it second silently overwrote the hand-written units with
 * the generated ones. Twelve units looked right and eight kept their old titles.
 */
const units: RawUnit[] = [];
const seenUnits = new Set<string>();
for (const f of UNIT_FILES) {
  if (!existsSync(path.join(ROOT, f))) continue;
  for (const u of JSON.parse(
    readFileSync(path.join(ROOT, f), "utf8"),
  ) as RawUnit[]) {
    if (seenUnits.has(u.id)) continue;
    seenUnits.add(u.id);
    units.push(u);
  }
}
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
/*
 * Extra vocabulary is spread across the EXISTING units of its level rather than
 * given new ones — EXCEPT in A1.1, which is hand-written now.
 *
 * This is where "Leiche" got into a beginner unit. import-vocab.mts pads the
 * deck from a subtitle frequency list and this loop posted the padding into
 * units whose can-do statement says something else entirely. A1.1 teaches
 * exactly what data/curriculum-a1.json says and nothing else; the rest of the
 * deck stays in the database, browsable, and is never introduced as new.
 */
const UNIT_ADDITIONS = path.join(ROOT, "data/unit-additions.json");
let added = 0;
if (existsSync(UNIT_ADDITIONS)) {
  const extra = JSON.parse(readFileSync(UNIT_ADDITIONS, "utf8")) as Record<
    string,
    string[]
  >;
  for (const u of units) {
    /* Hand-written levels take nothing from the padding. A2.1 joined them when
       its vocabulary was written: the additions map is the frequency list in
       positional chunks, which is what gave "Im Restaurant" Majestät. */
    if (["A1.1", "A1.2", "A2.1", "A2.2", "B1.1"].includes(u.level)) continue;
    const more = (extra[u.id] ?? []).filter(
      (id) => seenIds.has(id) && !u.words.includes(id),
    );
    if (more.length) {
      u.words = [...u.words, ...more];
      added += more.length;
    }
  }
}

/*
 * First unit to teach a word keeps it. A1.1 is hand-written and comes first, so
 * where a later generated unit had padded in the same word it loses it — a word
 * introduced twice is a second "new word" day for something already learnt, and
 * the FSRS card would be created against whichever unit got there first.
 */
const taughtBy = new Map<string, string>();

for (const u of units) {
  u.words = u.words.filter((id) => {
    const owner = taughtBy.get(id);
    if (owner) {
      return false;
    }
    taughtBy.set(id, u.id);
    return true;
  });
}

/*
 * Even out the generated levels.
 *
 * Two static inputs decide how many words a unit ends up with — the pool
 * build-units.mts spreads, and the frozen map in unit-additions.json — and they
 * were computed at different times against different distributions. The result
 * was B1.2 with 38 words in unit 1 and 3 in unit 20: one unit that is three
 * days of vocabulary and another that teaches almost nothing, with the reading
 * and scenario sitting stale in between.
 *
 * Balanced at seed time instead of re-freezing the map, so this cannot drift
 * again the next time either input is regenerated. A1 is hand-written and
 * exempt — those sizes are the curriculum's decision, not arithmetic.
 */
const MIN_WORDS = 6;
const MAX_WORDS = 30; // inside the 5..32 tests/content.test.mts asserts
let moved = 0;
for (const level of new Set(units.map((u) => u.level))) {
  if (level.startsWith("A1")) continue;
  const inLevel = units.filter((u) => u.level === level);
  if (inLevel.length < 2) continue;
  /* Bounded: every pass moves one word from the fullest unit to the emptiest,
     and stops as soon as both ends are in range or the gap closes. */
  for (let guard = 0; guard < 2000; guard++) {
    const bySize = [...inLevel].sort((a, b) => a.words.length - b.words.length);
    const low = bySize[0];
    const high = bySize[bySize.length - 1];
    if (low.words.length >= MIN_WORDS && high.words.length <= MAX_WORDS) break;
    if (high.words.length - low.words.length < 2) break;
    low.words.push(high.words.pop()!);
    moved++;
  }
}
if (moved)
  console.log(`OK${moved} words rebalanced across the generated units`);

/*
 * A unit with no scenario stores SQL NULL, not the four characters "null".
 *
 * JSON.stringify(null) is the string "null", which is perfectly truthy, so
 * session.ts pushed a Gespräch block for all forty A1 units and the block read
 * `payload.scenario.role` off the parsed null. That is a white screen at block
 * five or six — before the recap, which is the screen that saves the session.
 */
const orNull = (v: unknown) => (v == null ? null : JSON.stringify(v));

db.exec("BEGIN");
for (const u of units) {
  upU.run(
    u.id,
    u.level,
    u.ord,
    u.title,
    JSON.stringify(u.can_do),
    JSON.stringify(u.words),
    u.grammar_id,
    orNull(u.scenario),
    orNull(u.dialogue),
    JSON.stringify(u.prereq),
  );
}
db.exec("COMMIT");
console.log(
  `OK${units.length} units${added ? `  (+${added} words spread into them)` : ""}`,
);

// ---------------------------------------------------------------- readings
type RawReading = {
  id: string;
  unit_id: string;
  level: string;
  title: string;
  words: number;
  text: string;
  questions: unknown[];
  glossary: Record<string, string>;
};
const READING_FILES = [
  "data/readings-a1-1.json",
  "data/readings-a1-2.json",
  "data/readings-a2.json",
  "data/readings-b1.json",
];
const readings: RawReading[] = READING_FILES.filter((f) =>
  existsSync(path.join(ROOT, f)),
).flatMap(
  (f) => JSON.parse(readFileSync(path.join(ROOT, f), "utf8")) as RawReading[],
);
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
  upR.run(
    r.id,
    r.unit_id,
    r.level,
    r.title,
    r.text,
    r.words,
    JSON.stringify(r.questions),
    JSON.stringify(r.glossary),
  );
  db.prepare("UPDATE unit SET reading_id = ? WHERE id = ?").run(
    r.id,
    r.unit_id,
  );
}
db.exec("COMMIT");
console.log(`OK${readings.length} readings`);

// ---------------------------------------------------------------- examples
/* One sentence per word, chosen once by scripts/attach-examples.mts.
   Applied AFTER the word rows exist and only where a word has no curated
   example, so hand-written ones always win over corpus picks. */
type RawExample = { id: string; de: string; en: string; source: string };
const EXAMPLE_FILE = path.join(ROOT, "data/examples.json");
if (existsSync(EXAMPLE_FILE)) {
  const examples = JSON.parse(
    readFileSync(EXAMPLE_FILE, "utf8"),
  ) as RawExample[];
  const upE = db.prepare(
    `UPDATE word SET example_de = ?, example_en = ?
      WHERE id = ? AND (example_de IS NULL OR example_de = '')`,
  );
  db.exec("BEGIN");
  let applied = 0;
  for (const e of examples)
    applied += Number(upE.run(e.de, e.en, e.id).changes);
  db.exec("COMMIT");
  const covered = (
    db
      .prepare("SELECT COUNT(*) n FROM word WHERE example_de IS NOT NULL")
      .get() as { n: number }
  ).n;
  const total = (
    db.prepare("SELECT COUNT(*) n FROM word").get() as { n: number }
  ).n;
  console.log(
    `OK${applied} examples applied  (${covered}/${total} words have one)`,
  );
} else {
  console.log(
    "--  no data/examples.json — run `node scripts/attach-examples.mts`",
  );
}

// --------------------------------------------------------------- sentences
/* Levelled Tatoeba sentences, chosen once by scripts/import-sentences.mts and
   committed. Seeding reads the committed file, so a fresh clone needs no
   11 MB download and no network — same rule as words and readings. */
type RawSentence = {
  id: string;
  de: string;
  en: string;
  level: string;
  word_ids: string[];
  source: string;
};
const SENTENCE_FILE = path.join(ROOT, "data/sentences.json");
if (existsSync(SENTENCE_FILE)) {
  const sentences = JSON.parse(
    readFileSync(SENTENCE_FILE, "utf8"),
  ) as RawSentence[];
  const upS = db.prepare(`
    INSERT INTO sentence (id, de, en, level, word_ids_json, source, needs_unit)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      de=excluded.de, en=excluded.en, level=excluded.level,
      word_ids_json=excluded.word_ids_json, source=excluded.source,
      needs_unit=excluded.needs_unit
  `);
  db.exec("BEGIN");
  /* Classified here, once, rather than on every session build: the rules are
     pure and the corpus does not change between seeds. */
  const gated = { a11: 0, a12: 0, out: 0 };
  for (const s of sentences) {
    const needs = needsUnit(s.de);
    if (needs > 40) gated.out++;
    else if (needs > 20) gated.a12++;
    else gated.a11++;
    upS.run(
      s.id,
      s.de,
      s.en,
      s.level,
      JSON.stringify(s.word_ids ?? []),
      s.source,
      needs,
    );
  }
  db.exec("COMMIT");
  console.log(`OK${sentences.length} sentences  (Tatoeba, CC-BY 2.0 FR)`);
  console.log(
    `    by grammar: ${gated.a11} reachable in A1.1, ${gated.a12} in A1.2, ${gated.out} beyond A1`,
  );
} else {
  console.log(
    "--  no data/sentences.json — run `npm run import-sentences` to build it",
  );
}

// ---------------------------------------------------------------- videos
type RawVideo = {
  id: string;
  youtube_id: string;
  src_url: string | null;
  duration: number | null;
  title: string;
  level: string;
  channel: string;
  unit_id: string | null;
  segments: unknown[];
};
const videoPath = path.join(ROOT, "data/videos.json");
if (existsSync(videoPath)) {
  /* Two shapes. */
  const parsed: unknown = JSON.parse(readFileSync(videoPath, "utf8"));
  const raw = (
    Array.isArray(parsed)
      ? parsed
      : ((parsed as { videos?: unknown[] }).videos ?? [])
  ) as Partial<RawVideo>[];

  /*
   * A video is a direct mp4 (Deutsche Welle's CDN, the main source) OR a YouTube id (the handful
   * DW does not publish in its podcasts).
   */
  const videos: RawVideo[] = raw
    .filter(
      (v) =>
        Boolean(v.src_url) ||
        (typeof v.youtube_id === "string" && v.youtube_id.length === 11),
    )
    .map((v) => ({
      id:
        v.id ??
        (v.src_url
          ? `dw-${v.src_url
              .split("/")
              .pop()!
              .replace(/\.mp4$/i, "")}`
          : `yt-${v.youtube_id}`),
      youtube_id: v.youtube_id ?? "",
      src_url: v.src_url ?? null,
      duration: v.duration ?? null,
      title: v.title ?? v.youtube_id ?? "—",
      level: v.level ?? "A1.1",
      channel: v.channel ?? "Deutsche Welle",
      unit_id: v.unit_id ?? null,
      segments: v.segments ?? [],
    }));

  /* SEGMENTS ARE NEVER CLOBBERED BY AN EMPTY LIST. */
  const upV = db.prepare(`
    INSERT INTO video (id, youtube_id, src_url, duration, title, level, channel, unit_id, segments_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      youtube_id=excluded.youtube_id, src_url=excluded.src_url,
      duration=excluded.duration, title=excluded.title, level=excluded.level,
      channel=excluded.channel, unit_id=excluded.unit_id,
      segments_json=CASE WHEN excluded.segments_json IN ('[]', '')
                         THEN video.segments_json ELSE excluded.segments_json END
  `);
  db.exec("BEGIN");
  for (const v of videos) {
    upV.run(
      v.id,
      v.youtube_id,
      v.src_url,
      v.duration,
      v.title,
      v.level,
      v.channel,
      v.unit_id,
      JSON.stringify(v.segments ?? []),
    );
    if (v.unit_id)
      db.prepare("UPDATE unit SET video_id = ? WHERE id = ?").run(
        v.id,
        v.unit_id,
      );
  }
  db.exec("COMMIT");
  const timestamped = videos.filter((v) => (v.segments ?? []).length).length;
  console.log(`OK${videos.length} videos (${timestamped} timestamped)`);
}

// -------------------------------------------------------- error patterns
/* The prebuilt half of the explanation cache (spec §12). */
type RawPattern = {
  _?: string;
  key?: string;
  wrong?: string;
  right?: string;
  /** Surface forms, for pairs of verbs. See the note below. */
  wrongForms?: string[];
  rightForms?: string[];
  both?: boolean;
  tag: string;
  why?: string;
};
const PATTERN_FILE = path.join(ROOT, "data/error-patterns.json");
if (existsSync(PATTERN_FILE)) {
  const raw = JSON.parse(readFileSync(PATTERN_FILE, "utf8")) as RawPattern[];
  const rows: { sig: string; tag: string; md: string }[] = [];
  let entries = 0;

  for (const p of raw) {
    if (p._ || !p.why) continue; // section headings carry no explanation
    entries++;

    if (p.key) {
      rows.push({ sig: p.key, tag: p.tag, md: p.why });
      continue;
    }

    /* A key is built from the surface forms a learner actually types, so a
       pair of verbs needs its conjugations spelled out: "Ich kenne es nicht"
       for "Ich weiß es nicht" produces `w:kenne→weiß`, and an entry written
       about the infinitives kennen and wissen would never have matched it.
       One entry, one explanation, every form crossed with every form. */
    const lefts = p.wrongForms ?? (p.wrong ? [p.wrong] : []);
    const rights = p.rightForms ?? (p.right ? [p.right] : []);
    for (const l of lefts) {
      for (const r of rights) {
        rows.push({ sig: wordKey(l, r), tag: p.tag, md: p.why });
        // `both` means the distinction reads the same from either side, so the
        // reverse direction gets the same text rather than a second entry.
        if (p.both) rows.push({ sig: wordKey(r, l), tag: p.tag, md: p.why });
      }
    }
  }

  /* First one wins, so an earlier, more specific section beats a later one.
     A duplicate is a mistake in the data either way, so it is reported. */
  const seen = new Set<string>();
  const dupes: string[] = [];
  const unique = rows.filter((r) => {
    if (seen.has(r.sig)) {
      dupes.push(r.sig);
      return false;
    }
    seen.add(r.sig);
    return true;
  });
  if (dupes.length) {
    console.warn(
      `  ! duplicate error-pattern keys: ${[...new Set(dupes)].join(", ")}`,
    );
  }

  const upP = db.prepare(`
    INSERT INTO error_pattern (tag, signature, explain_md, source, hits)
    VALUES (?, ?, ?, 'prebuilt', 0)
    ON CONFLICT(signature) DO UPDATE SET
      tag=excluded.tag, explain_md=excluded.explain_md, source='prebuilt'
  `);
  db.exec("BEGIN");
  for (const r of unique) upP.run(r.tag, r.sig, r.md);

  /*
   * Drop prebuilt rows the file no longer produces. Only `prebuilt` rows are touched: a generated
   * one was earned by somebody actually making that mistake.
   */
  const live = new Set(unique.map((r) => r.sig));
  const stale = (
    db
      .prepare("SELECT signature FROM error_pattern WHERE source = 'prebuilt'")
      .all() as {
      signature: string;
    }[]
  )
    .map((r) => r.signature)
    .filter((s) => !live.has(s));
  const del = db.prepare(
    "DELETE FROM error_pattern WHERE signature = ? AND source = 'prebuilt'",
  );
  for (const s of stale) del.run(s);
  db.exec("COMMIT");

  console.log(
    `OK${entries} prebuilt error patterns  (${unique.length} keys after conjugations` +
      `${stale.length ? `, ${stale.length} stale removed` : ""})`,
  );
} else {
  console.log("--  no data/error-patterns.json");
}

// Sanity: every word referenced by a unit must exist.
const known = new Set(words.map((w) => w.id));
const dangling = units.flatMap((u) => u.words.filter((w) => !known.has(w)));
if (dangling.length)
  console.warn(`  ! unknown word ids in units: ${dangling.join(", ")}`);
console.log(`  -> ${path.basename(DB_PATH)}`);
