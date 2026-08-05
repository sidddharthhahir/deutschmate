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
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { applySchema, DB_PATH } from "../src/lib/db.ts";
import { wordKey } from "../src/lib/error-key.ts";

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
/* Words from import-vocab.mts carry their own level, so they are loaded after
   the hand-curated files and skipped where they duplicate one. The curated
   entry always wins — it has a checked gloss and often a written example. */
const EXTRA_WORDS = path.join(ROOT, "data/words-extra.json");
let extraCount = 0;
if (existsSync(EXTRA_WORDS)) {
  for (const w of JSON.parse(readFileSync(EXTRA_WORDS, "utf8")) as (Raw & { level: string })[]) {
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

/* Point every word at its recording if the file is already committed.
   `npm run audio` sets audio_url as it downloads, but a fresh clone never runs
   it — the .ogg files arrive with the repo and the column stays NULL, so the
   app would show no audio at all while the recordings sat right there in
   public/. The filename is the word id, so the link needs no network and no
   manifest. */
const AUDIO_DIR = path.join(ROOT, "public/audio/words");
let linked = 0;
if (existsSync(AUDIO_DIR)) {
  const onDisk = new Set(
    readdirSync(AUDIO_DIR).filter((f) => f.endsWith(".ogg")).map((f) => f.slice(0, -4)),
  );
  const setAudio = db.prepare("UPDATE word SET audio_url = ?, audio_source = 'commons' WHERE id = ?");
  db.exec("BEGIN");
  for (const w of words) {
    if (onDisk.has(w.id)) {
      setAudio.run(`/audio/words/${w.id}.ogg`, w.id);
      linked++;
    }
  }
  db.exec("COMMIT");
}

/* Seeding upserts, so a word dropped from the content files would otherwise sit
   in the deck forever — that is how a stale run of import-vocab left 94 words
   behind that no unit taught. Words nobody has studied are removed; a word with
   review history is kept, because deleting it would throw away real progress
   for the sake of tidiness. Those are reported rather than hidden. */
const stale = (
  db.prepare("SELECT id FROM word").all() as { id: string }[]
).filter((w) => !seenIds.has(w.id));
let dropped = 0;
let keptInUse = 0;
if (stale.length) {
  const studied = db.prepare(
    "SELECT 1 FROM card WHERE ref_type = 'word' AND ref_id = ? AND reps > 0 LIMIT 1",
  );
  const delCard = db.prepare("DELETE FROM card WHERE ref_type = 'word' AND ref_id = ?");
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
  `OK ${words.length} words  (${Object.entries(byLevel).map(([l, n]) => `${l}:${n}`).join("  ")})` +
    (dupes ? `  [${dupes} duplicates kept at their lowest level]` : "") +
    (extraCount ? `\n   ${extraCount} of them from Wiktionary (CC BY-SA)` : "") +
    (linked ? `\n   ${linked} linked to a committed recording` : "") +
    (dropped ? `\n   ${dropped} words no longer in the content files were removed` : "") +
    (keptInUse ? `\n   ${keptInUse} kept despite that: they already have review history` : ""),
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
/* Extra vocabulary is spread across the EXISTING units of its level rather
   than given new ones. A unit holding more words than a day introduces already
   carries over to the next day, and this way every unit keeps the reading,
   scenario and grammar point attached to it — which brand-new units would not
   have. Only ids that really exist are added, so a stale file cannot point a
   unit at a missing word. */
const UNIT_ADDITIONS = path.join(ROOT, "data/unit-additions.json");
let added = 0;
if (existsSync(UNIT_ADDITIONS)) {
  const extra = JSON.parse(readFileSync(UNIT_ADDITIONS, "utf8")) as Record<string, string[]>;
  for (const u of units) {
    const more = (extra[u.id] ?? []).filter((id) => seenIds.has(id) && !u.words.includes(id));
    if (more.length) {
      u.words = [...u.words, ...more];
      added += more.length;
    }
  }
}

db.exec("BEGIN");
for (const u of units) {
  upU.run(u.id, u.level, u.ord, u.title, JSON.stringify(u.can_do),
    JSON.stringify(u.words), u.grammar_id, JSON.stringify(u.scenario),
    JSON.stringify(u.dialogue), JSON.stringify(u.prereq));
}
db.exec("COMMIT");
console.log(`OK${units.length} units${added ? `  (+${added} words spread into them)` : ""}`);

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

// ---------------------------------------------------------------- examples
/* One sentence per word, chosen once by scripts/attach-examples.mts.
   Applied AFTER the word rows exist and only where a word has no curated
   example, so hand-written ones always win over corpus picks. */
type RawExample = { id: string; de: string; en: string; source: string };
const EXAMPLE_FILE = path.join(ROOT, "data/examples.json");
if (existsSync(EXAMPLE_FILE)) {
  const examples = JSON.parse(readFileSync(EXAMPLE_FILE, "utf8")) as RawExample[];
  const upE = db.prepare(
    `UPDATE word SET example_de = ?, example_en = ?
      WHERE id = ? AND (example_de IS NULL OR example_de = '')`,
  );
  db.exec("BEGIN");
  let applied = 0;
  for (const e of examples) applied += Number(upE.run(e.de, e.en, e.id).changes);
  db.exec("COMMIT");
  const covered = (
    db.prepare("SELECT COUNT(*) n FROM word WHERE example_de IS NOT NULL").get() as { n: number }
  ).n;
  const total = (db.prepare("SELECT COUNT(*) n FROM word").get() as { n: number }).n;
  console.log(`OK${applied} examples applied  (${covered}/${total} words have one)`);
} else {
  console.log("--  no data/examples.json — run `node scripts/attach-examples.mts`");
}

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
  id: string; youtube_id: string; src_url: string | null; duration: number | null;
  title: string; level: string;
  channel: string; unit_id: string | null; segments: unknown[];
};
const videoPath = path.join(ROOT, "data/videos.json");
if (existsSync(videoPath)) {
  /* Two shapes. The file was a bare array; it is now an object with the
     curation notes beside the list, because where these came from and why they
     are unassigned is worth keeping next to them. Both are accepted, so an
     older file still seeds. */
  const parsed: unknown = JSON.parse(readFileSync(videoPath, "utf8"));
  const raw = (
    Array.isArray(parsed) ? parsed : ((parsed as { videos?: unknown[] }).videos ?? [])
  ) as Partial<RawVideo>[];

  /* A video is a direct mp4 (Deutsche Welle's CDN, the main source) OR a
     YouTube id (the handful DW does not publish in its podcasts). Filtering on
     an 11-character youtube_id dropped all 226 DW episodes on the floor and
     left a fresh clone with five videos — the shape of the catalogue changed
     and this did not. Ids match scripts/videos.mts so the two agree about which
     row is which. */
  const videos: RawVideo[] = raw
    .filter((v) => Boolean(v.src_url) || (typeof v.youtube_id === "string" && v.youtube_id.length === 11))
    .map((v) => ({
      id:
        v.id ??
        (v.src_url
          ? `dw-${v.src_url.split("/").pop()!.replace(/\.mp4$/i, "")}`
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

  /*
   * SEGMENTS ARE NEVER CLOBBERED BY AN EMPTY LIST.
   *
   * This used to be a plain `segments_json=excluded.segments_json`, which meant
   * `npm run seed` wrote whatever the file said — and the file carries no
   * segments, because marking them up is a human job done in /admin/video and
   * saved to the database. So a reseed would have silently deleted every
   * hand-marked video in the install: about twelve minutes of work each, with
   * no error and nothing on screen to say it had happened. Re-seeding content
   * must never destroy the one kind of content a person made by hand.
   *
   * A file that DOES carry segments still updates them — that is the path for
   * committing marked-up videos to the repo later.
   */
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
    upV.run(v.id, v.youtube_id, v.src_url, v.duration, v.title, v.level, v.channel, v.unit_id,
      JSON.stringify(v.segments ?? []));
    if (v.unit_id) db.prepare("UPDATE unit SET video_id = ? WHERE id = ?").run(v.id, v.unit_id);
  }
  db.exec("COMMIT");
  const timestamped = videos.filter((v) => (v.segments ?? []).length).length;
  console.log(`OK${videos.length} videos (${timestamped} timestamped)`);
}

// -------------------------------------------------------- error patterns
/*
 * The prebuilt half of the explanation cache (spec §12).
 *
 * These are keyed on the DIFFERENCE between a right and a wrong answer, not on
 * a sentence pair, which is what makes writing them in advance possible at all
 * — see src/lib/error-key.ts. Seeded with source='prebuilt' so they are
 * distinguishable from rows the app wrote itself, and re-seeding refreshes the
 * text without touching the hit counts.
 */
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
    console.warn(`  ! duplicate error-pattern keys: ${[...new Set(dupes)].join(", ")}`);
  }

  const upP = db.prepare(`
    INSERT INTO error_pattern (tag, signature, explain_md, source, hits)
    VALUES (?, ?, ?, 'prebuilt', 0)
    ON CONFLICT(signature) DO UPDATE SET
      tag=excluded.tag, explain_md=excluded.explain_md, source='prebuilt'
  `);
  db.exec("BEGIN");
  for (const r of unique) upP.run(r.tag, r.sig, r.md);

  /* Drop prebuilt rows the file no longer produces.
     Upserting alone leaves the old key behind when an entry is reworded or its
     key changes — `w:im→am` survived a rewrite that had replaced it with
     `w:in→an`, unreachable and invisible, and the row count quietly disagreed
     with the file. Only `prebuilt` rows are touched: a generated one was
     earned by somebody actually making that mistake. */
  const live = new Set(unique.map((r) => r.sig));
  const stale = (
    db.prepare("SELECT signature FROM error_pattern WHERE source = 'prebuilt'").all() as {
      signature: string;
    }[]
  )
    .map((r) => r.signature)
    .filter((s) => !live.has(s));
  const del = db.prepare("DELETE FROM error_pattern WHERE signature = ? AND source = 'prebuilt'");
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
if (dangling.length) console.warn(`  ! unknown word ids in units: ${dangling.join(", ")}`);
console.log(`  -> ${path.basename(DB_PATH)}`);

