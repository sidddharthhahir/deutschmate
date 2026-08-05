/**
 * Export real data for the design pass. node scripts/export-for-design.mts A designer working from
 * invented content produces layouts that break on contact with real data.
 */
import { DatabaseSync } from "node:sqlite";
import {
  writeFileSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
} from "node:fs";
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
  return [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => esc(r[c])).join(",")),
  ].join("\n");
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
      .prepare(
        "SELECT lemma, LENGTH(lemma) n FROM word ORDER BY n DESC LIMIT 15",
      )
      .all() as { lemma: string; n: number }[]
  ).map((r) => `${r.lemma} (${r.n})`),
  englishGlosses: (
    db
      .prepare("SELECT en, LENGTH(en) n FROM word ORDER BY n DESC LIMIT 10")
      .all() as {
      en: string;
      n: number;
    }[]
  ).map((r) => `${r.en} (${r.n})`),
  unitTitles: (
    db
      .prepare(
        "SELECT title, LENGTH(title) n FROM unit ORDER BY n DESC LIMIT 10",
      )
      .all() as {
      title: string;
      n: number;
    }[]
  ).map((r) => `${r.title} (${r.n})`),
  canDoStatements: (
    db.prepare("SELECT can_do_json FROM unit").all() as {
      can_do_json: string;
    }[]
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
      db
        .prepare("SELECT COUNT(*) n FROM word WHERE audio_url IS NOT NULL")
        .get() as {
        n: number;
      }
    ).n,
    units: (db.prepare("SELECT COUNT(*) n FROM unit").get() as { n: number }).n,
    grammar: (
      db.prepare("SELECT COUNT(*) n FROM grammar").get() as { n: number }
    ).n,
    readings: (
      db.prepare("SELECT COUNT(*) n FROM reading").get() as { n: number }
    ).n,
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
  /* Read out of ReviewBlock rather than restated. */
  gradeButtons: readGrades(),
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
/* Walked off the filesystem rather than hand-listed. The hand-written version
   drifted to nine pages while the app grew to twenty-two, and a route list a
   designer cannot trust is worse than no route list. */
function walk(dir: string, marker: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const here = `${prefix}/${e.name}`;
    if (existsSync(path.join(dir, e.name, marker))) out.push(here);
    out.push(...walk(path.join(dir, e.name), marker, here));
  }
  return out.sort();
}

const grammarCount = (
  db.prepare("SELECT COUNT(*) AS n FROM grammar").get() as { n: number }
).n;

/** The four grade buttons, parsed out of the component that renders them. */
function readGrades() {
  const src = readFileSync(
    path.join(ROOT, "src/components/blocks/ReviewBlock.tsx"),
    "utf8",
  );
  const body = src.match(/const GRADES = \[([\s\S]*?)\];/)?.[1] ?? "";
  return [
    ...body.matchAll(/g:\s*(\d+),\s*label:\s*"([^"]+)",\s*hint:\s*"([^"]+)"/g),
  ].map((m) => ({ key: m[1], label: m[2], hint: m[3] }));
}

const appDir = path.join(ROOT, "src/app");
const pages = [
  ...(existsSync(path.join(appDir, "page.tsx")) ? ["/"] : []),
  ...walk(appDir, "page.tsx").filter((r) => !r.startsWith("/api")),
];
const apis = walk(path.join(appDir, "api"), "route.ts").map((r) => `/api${r}`);

/* The block union is the source of truth for what /session can render, so it
   is read out of the type rather than restated. */
const blockKinds =
  readFileSync(path.join(ROOT, "src/lib/session.ts"), "utf8")
    .match(/export type BlockKind =([\s\S]*?);/)?.[1]
    .match(/"([a-z-]+)"/g)
    ?.map((s) => s.replace(/"/g, "")) ?? [];

const NOTE: Record<string, string> = {
  "/": "Home — the one button",
  "/session": `Session runner (renders ${blockKinds.length} block types)`,
  "/wortschatz": `Browse all ${words.length} words`,
  "/fortschritt": "Progress — the last 30 days",
  "/weg": "Der Weg — the whole course, skills earned, milestones",
  "/ueben": "Free practice + scenario list",
  "/wer": "Which learner is this browser",
  "/willkommen": "First-run tour, bilingual",
  "/woche": "Weekly digest",
  "/text": "Paste any German",
  "/nachrichten": "DW news, slowly spoken",
  "/alltag": "Survival scenarios",
  "/unterwegs": "Hands-free listening",
  "/aussprache": "Minimal pairs",
  "/problemwoerter": "Leeches — words fighting back",
  "/pruefung": "Practice test (NOT the Goethe Modellsatz)",
  "/admin/video": "Video segment editor (not learner-facing)",
  "/wort/[id]": "Word detail — forms, audio, your history with it",
  "/grammatik/[slug]": `Grammar reference (${grammarCount} points)`,
  "/szenario/[id]": "Replay any roleplay",
  "/alltag/[id]": "One survival scenario",
  "/fehler/[tag]": "Drill down into one error type",
};

const routes = `# DeutschMate routes

Generated by \`npm run export-design\` — do not hand-edit.

## Pages (${pages.length})
${pages.map((p) => `${p.padEnd(24)}${NOTE[p] ?? ""}`.trimEnd()).join("\n")}

## Session block types rendered inside /session (${blockKinds.length})
${blockKinds.join(" · ")}

## API (${apis.length})
${apis.join("\n")}
`;
writeFileSync(path.join(OUT, "routes.md"), routes);

console.log("design-export/");
console.log(`  vocabulary.csv   ${words.length} rows`);
console.log(`  units.csv        ${units.length} rows`);
console.log(`  samples.json     real cards, rows, longest strings`);
console.log(`  routes.md`);
console.log(`\nlongest German word: ${longest.words[0]}`);
console.log(`longest can-do:      ${longest.canDoStatements[0]}`);
