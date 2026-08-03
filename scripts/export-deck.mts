/**
 * Export the deck to something any other tool can read.
 *
 *   node scripts/export-deck.mts              # Anki-ready TSV + full JSON
 *   node scripts/export-deck.mts --user sid
 *
 * Six months of learning should not be trapped in one SQLite file on one
 * laptop. This is the exit door: if DeutschMate stops being the right tool,
 * the work comes with you.
 *
 * Two formats, because they answer different questions:
 *
 *   .tsv    drag straight into Anki. Front, Back, Tags. Anki's importer reads
 *           this with no configuration, which is the whole point.
 *   .json   everything — FSRS state, lapse counts, mined gaps, review history
 *           totals. Lossless, for anyone who wants to do something else with it.
 *
 * Scheduling state is exported but NOT translated into Anki's model. Anki and
 * FSRS store different things, and a converted interval would look precise
 * while being made up. The numbers are there in the JSON; the TSV is content.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DB_PATH = process.env.DEUTSCHMATE_DB
  ? path.resolve(process.env.DEUTSCHMATE_DB)
  : path.join(ROOT, "deutschmate.db");
const OUT = path.join(ROOT, "exports");

const args = process.argv.slice(2);
const user = args.includes("--user") ? args[args.indexOf("--user") + 1] : "sid";

const db = new DatabaseSync(DB_PATH, { readOnly: true });
db.exec("PRAGMA busy_timeout = 10000");

type WordRow = {
  lemma: string;
  article: string | null;
  plural: string | null;
  pos: string;
  en: string;
  level: string;
  example_de: string | null;
  example_en: string | null;
  reps: number;
  lapses: number;
  stability: number;
  difficulty: number;
  state: number;
  due: string;
  last_review: string | null;
  suspended: number;
};

const words = db
  .prepare(
    `SELECT w.lemma, w.article, w.plural, w.pos, w.en, w.level,
            w.example_de, w.example_en,
            c.reps, c.lapses, c.stability, c.difficulty, c.state, c.due,
            c.last_review, c.suspended
       FROM card c JOIN word w ON w.id = c.ref_id
      WHERE c.user_id = ? AND c.ref_type = 'word'
      ORDER BY w.level, w.freq_rank`,
  )
  .all(user) as WordRow[];

type ClozeRow = {
  sentence: string;
  answer: string;
  full: string;
  en: string | null;
  source: string;
  tag: string | null;
  reps: number;
  lapses: number;
  due: string;
};

const cloze = db
  .prepare(
    `SELECT cl.sentence, cl.answer, cl.full, cl.en, cl.source, cl.tag,
            COALESCE(c.reps,0) AS reps, COALESCE(c.lapses,0) AS lapses,
            COALESCE(c.due,'') AS due
       FROM cloze cl
       LEFT JOIN card c
         ON c.user_id = cl.user_id AND c.ref_type='cloze'
        AND c.ref_id = CAST(cl.id AS TEXT)
      WHERE cl.user_id = ?
      ORDER BY cl.id`,
  )
  .all(user) as ClozeRow[];

if (!words.length && !cloze.length) {
  console.error(`Nothing to export for user "${user}" — the deck is empty.`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------ TSV
/** Anki splits on tabs and newlines, so neither may survive inside a field. */
const clean = (s: string | null) => (s ?? "").replace(/[\t\r\n]+/g, " ").trim();

const front = (w: WordRow) => (w.article ? `${w.article} ${w.lemma}` : w.lemma);

const back = (w: WordRow) => {
  const bits = [w.en];
  if (w.pos === "noun" && w.plural) bits.push(`Pl. die ${w.plural}`);
  if (w.example_de) bits.push(`<br><i>${clean(w.example_de)}</i>`);
  if (w.example_en) bits.push(`<br><small>${clean(w.example_en)}</small>`);
  return bits.map(clean).filter(Boolean).join(" · ");
};

const rows = [
  ["#separator:tab"],
  ["#html:true"],
  ["#tags column:3"],
  ...words.map((w) => [
    clean(front(w)),
    back(w),
    `DeutschMate ${w.level.replace(".", "_")} ${w.pos}${w.suspended ? " pausiert" : ""}`,
  ]),
  ...cloze.map((c) => [
    clean(c.sentence),
    `${clean(c.answer)}${c.en ? ` · ${clean(c.en)}` : ""}<br><small>${clean(c.full)}</small>`,
    `DeutschMate Lücke ${c.source}`,
  ]),
];

const tsv = path.join(OUT, `deutschmate-${user}-${stamp}.tsv`);
writeFileSync(tsv, rows.map((r) => r.join("\t")).join("\n") + "\n", "utf8");

// ------------------------------------------------------------------ JSON
const json = path.join(OUT, `deutschmate-${user}-${stamp}.json`);
writeFileSync(
  json,
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      user,
      note:
        "FSRS scheduling state is included as-is. It is not converted to Anki's " +
        "scheduler, because the two models store different things and a converted " +
        "interval would look exact while being invented.",
      words,
      cloze,
    },
    null,
    2,
  ),
  "utf8",
);

db.close();

console.log(`OK  ${path.relative(ROOT, tsv)}    ${words.length} words + ${cloze.length} gaps`);
console.log(`OK  ${path.relative(ROOT, json)}   full state\n`);
console.log("Anki:  File -> Import -> pick the .tsv -> Basic note type.");
console.log("       Headers set the separator and tags automatically.");
