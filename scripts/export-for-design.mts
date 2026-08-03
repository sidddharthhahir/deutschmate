/**
 * Export real data for the design pass.
 *
 *   node scripts/export-for-design.mts
 *
 * A designer working from invented content produces layouts that break on
 * contact with real data. This dumps actual rows, at actual lengths, including
 * the longest strings in the database — which is what layouts have to survive.
 */
import { DatabaseSync } from "node:sqlite";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design-export");
mkdirSync(OUT, { recursive: true });

const db = new DatabaseSync(path.join(ROOT, "deutschmate.db"));
db.exec("PRAGMA busy_timeout = 10000");

const csv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
};

// ---------------------------------------------------------------- vocabulary
const words = db
  .prepare(
    `SELECT id, lemma, article, plural, pos, en, level, topic,
            CASE WHEN audio_url IS NULL THEN 0 ELSE 1 END AS has_audio,
            example_de, example_en
       FROM word ORDER BY freq_rank`,
  )
  .all() as Record<string, unknown>[];
writeFileSync(path.join(OUT, "vocabulary.csv"), csv(words));

// ---------------------------------------------------------------- units
const units = db
  .prepare(
    `SELECT id, level, ord, title, can_do_json, grammar_id, reading_id, video_id,
            json_array_length(word_ids_json) AS word_count
       FROM unit ORDER BY level, ord`,
  )
  .all() as Record<string, unknown>[];
writeFileSync(path.join(OUT, "units.csv"), csv(units));

// ---------------------------------------------------------------- longest strings
// The real stress test for any layout.
const longest = {
  words: (
    db
      .prepare("SELECT lemma, LENGTH(lemma) n FROM word ORDER BY n DESC LIMIT 15")
      .all() as { lemma: string; n: number }[]
  ).map((r) => `${r.lemma} (${r.n})`),
  englishGlosses: (
    db.prepare("SELECT en, LENGTH(en) n FROM word ORDER BY n DESC LIMIT 10").all() as {
      en: string;
      n: number;
    }[]
  ).map((r) => `${r.en} (${r.n})`),
  unitTitles: (
    db.prepare("SELECT title, LENGTH(title) n FROM unit ORDER BY n DESC LIMIT 10").all() as {
      title: string;
      n: number;
    }[]
  ).map((r) => `${r.title} (${r.n})`),
  canDoStatements: (
    db.prepare("SELECT can_do_json FROM unit").all() as { can_do_json: string }[]
  )
    .flatMap((r) => JSON.parse(r.can_do_json) as string[])
    .sort((a, b) => b.length - a.length)
    .slice(0, 10)
    .map((s) => `${s} (${s.length})`),
  exampleSentences: (
    db
      .prepare(
        "SELECT example_de, LENGTH(example_de) n FROM word WHERE example_de IS NOT NULL ORDER BY n DESC LIMIT 8",
      )
      .all() as { example_de: string; n: number }[]
  ).map((r) => `${r.example_de} (${r.n})`),
};

// ---------------------------------------------------------------- samples
const sample = {
  scale: {
    words: (db.prepare("SELECT COUNT(*) n FROM word").get() as { n: number }).n,
    wordsWithAudio: (
      db.prepare("SELECT COUNT(*) n FROM word WHERE audio_url IS NOT NULL").get() as {
        n: number;
      }
    ).n,
    units: (db.prepare("SELECT COUNT(*) n FROM unit").get() as { n: number }).n,
    grammar: (db.prepare("SELECT COUNT(*) n FROM grammar").get() as { n: number }).n,
    readings: (db.prepare("SELECT COUNT(*) n FROM reading").get() as { n: number }).n,
  },
  reviewCards: db
    .prepare(
      `SELECT lemma, article, plural, pos, en, example_de, forms_json
         FROM word WHERE level='A1.1' ORDER BY freq_rank LIMIT 6`,
    )
    .all(),
  wortschatzRows: db
    .prepare(
      `SELECT w.article, w.lemma, w.plural, w.en, w.example_de, u.ord AS unit_ord, u.title AS unit_title
         FROM word w LEFT JOIN unit u
           ON EXISTS (SELECT 1 FROM json_each(u.word_ids_json) je WHERE je.value = w.id)
        WHERE w.level='B1.1' ORDER BY w.freq_rank LIMIT 8`,
    )
    .all(),
  errorTagLabels: [
    "Wrong article (der/die/das)",
    "Nominative article where accusative is needed",
    "Wrong verb ending for the subject",
    "Verb not in second position",
    "Infinitive not at the end after a modal",
    "nicht vs kein",
  ],
  gradeButtons: [
    { key: "1", label: "Nochmal", hint: "no idea" },
    { key: "2", label: "Schwer", hint: "slowly" },
    { key: "3", label: "Gut", hint: "knew it" },
    { key: "4", label: "Einfach", hint: "instant" },
  ],
  offlineMessages: [
    "Offline — Ersatzübung statt Video",
    "Offline-Variante — vorbereiteter Dialog",
    "Du bist offline. Die Korrektur kommt automatisch, sobald du wieder online bist.",
    "144 fällig — heute 60. Der Rest kommt morgen.",
  ],
  longestStrings: longest,
};
writeFileSync(path.join(OUT, "samples.json"), JSON.stringify(sample, null, 2));

// ---------------------------------------------------------------- routes
const routes = `# DeutschMate routes

## Pages
/                       Home — the one button
/session                Session runner (renders 11 block types)
/wortschatz             Browse all 2,400 words
/fortschritt            Progress
/ueben                  Free practice + scenario list
/wort/[id]              Word detail
/grammatik/[slug]       Grammar reference (36 points)
/szenario/[id]          Replay any roleplay
/admin/video            Video segment editor (not learner-facing)

## Session block types rendered inside /session
review · fix · new-vocab · new-grammar · listening · reading
video · builder · conversation · writing · speaking · quiz

## API
/api/session   /api/review   /api/attempt   /api/quiz
/api/chat      /api/writing  /api/wortschatz  /api/word  /api/video
`;
writeFileSync(path.join(OUT, "routes.md"), routes);

console.log("design-export/");
console.log(`  vocabulary.csv   ${words.length} rows`);
console.log(`  units.csv        ${units.length} rows`);
console.log(`  samples.json     real cards, rows, longest strings`);
console.log(`  routes.md`);
console.log(`\nlongest German word: ${longest.words[0]}`);
console.log(`longest can-do:      ${longest.canDoStatements[0]}`);
