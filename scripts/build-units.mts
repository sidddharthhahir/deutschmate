/**
 * Build the full 120-unit curriculum. node scripts/build-units.mts Units are half hand-authored,
 * half derived: HAND-AUTHORED (data/blueprints-*.json) — title, can-do statements, roleplay
 * scenario, offline dialogue.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const db = new DatabaseSync(path.join(ROOT, "deutschmate.db"));
db.exec("PRAGMA busy_timeout = 10000");

const LEVELS = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2"] as const;
const UNITS_PER_LEVEL = 20;

type Blueprint = {
  level: string;
  ord: number;
  title: string;
  can_do: string[];
  scenario: { role: string; goal: string; opener: string };
  dialogue?: {
    them: string;
    options: { say: string; ok: boolean; why?: string; next: number }[];
  }[];
};

const BLUEPRINT_FILES = [
  "data/blueprints-a1.json",
  "data/blueprints-a2.json",
  "data/blueprints-b1.json",
];

const blueprints: Blueprint[] = BLUEPRINT_FILES.filter((f) =>
  existsSync(path.join(ROOT, f)),
).flatMap(
  (f) => JSON.parse(readFileSync(path.join(ROOT, f), "utf8")) as Blueprint[],
);

console.log(`${blueprints.length} blueprints loaded`);

// Units 1-12 of A1.1 are hand-written in data/units-a1-1.json with their own
// curated word sets. Don't regenerate them; start A1.1 at 13.
const HANDWRITTEN = new Set(
  (
    JSON.parse(
      readFileSync(path.join(ROOT, "data/units-a1-1.json"), "utf8"),
    ) as {
      id: string;
      word_ids?: string[];
      words: string[];
    }[]
  ).flatMap((u) => u.words),
);

type Word = { id: string; level: string };
type Grammar = { id: string; level: string; ord: number };

const out: unknown[] = [];
let missingBlueprints = 0;

/**
 * ONE global pool, ordered by level then frequency, minus anything the hand-written A1.1 units
 * already teach.
 */
const LEVEL_ORDER = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
const globalPool = (
  db.prepare("SELECT id, level FROM word ORDER BY freq_rank").all() as Word[]
)
  .filter((w) => !HANDWRITTEN.has(w.id))
  .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

const totalSlots = blueprints.length;
const perUnitGlobal = Math.max(4, Math.floor(globalPool.length / totalSlots));
let globalCursor = 0;

console.log(
  `${globalPool.length} unplaced words across ${totalSlots} generated units ` +
    `(~${perUnitGlobal}/unit)`,
);

for (const level of LEVELS) {
  const bps = blueprints
    .filter((b) => b.level === level)
    .sort((a, b) => a.ord - b.ord);

  const grammar = db
    .prepare("SELECT id, level, ord FROM grammar WHERE level = ? ORDER BY ord")
    .all(level) as Grammar[];

  const firstOrd = level === "A1.1" ? 13 : 1;
  const slots = UNITS_PER_LEVEL - firstOrd + 1;

  // Space the grammar points evenly across the level's units rather than
  // front-loading them — a learner should not meet six new rules in week one.
  const grammarEvery = grammar.length
    ? Math.max(1, Math.floor(slots / grammar.length))
    : 0;

  let grammarUsed = 0;
  let placedHere = 0;

  for (let ord = firstOrd; ord <= UNITS_PER_LEVEL; ord++) {
    const bp = bps.find((b) => b.ord === ord);
    if (!bp) {
      missingBlueprints++;
      continue;
    }

    // Last generated unit sweeps up any remainder so no word is left unplaced.
    const isLast = out.length === totalSlots - 1;
    const take = isLast ? globalPool.length - globalCursor : perUnitGlobal;
    const words = globalPool
      .slice(globalCursor, globalCursor + take)
      .map((w) => w.id);
    globalCursor += take;
    placedHere += words.length;

    const idx = ord - firstOrd;
    let grammarId: string | null = null;
    if (
      grammarEvery &&
      idx % grammarEvery === 0 &&
      grammarUsed < grammar.length
    ) {
      grammarId = grammar[grammarUsed].id;
      grammarUsed++;
    }

    const levelSlug = level.toLowerCase().replace(".", "-");
    const prevOrd = ord - 1;
    const prevLevel = LEVELS[LEVELS.indexOf(level) - 1];

    out.push({
      id: `${levelSlug}-u${String(ord).padStart(2, "0")}`,
      level,
      ord,
      title: bp.title,
      can_do: bp.can_do,
      words,
      grammar_id: grammarId,
      scenario: bp.scenario,
      dialogue: bp.dialogue ?? defaultDialogue(bp),
      prereq:
        prevOrd >= 1
          ? [`${levelSlug}-u${String(prevOrd).padStart(2, "0")}`]
          : prevLevel
            ? [`${prevLevel.toLowerCase().replace(".", "-")}-u20`]
            : [],
    });
  }

  console.log(
    `${level}: ${bps.length} units, ${placedHere} words, ` +
      `${grammarUsed}/${grammar.length} grammar points`,
  );
}

/** Offline fallback when a blueprint doesn't ship a hand-written dialogue. */
function defaultDialogue(bp: Blueprint) {
  return [
    {
      them: bp.scenario.opener,
      options: [
        { say: "Ja, gern.", ok: true, next: 1 },
        { say: "Entschuldigung, ich verstehe nicht.", ok: true, next: 1 },
      ],
    },
    {
      them: "Alles klar. Danke!",
      options: [{ say: "Danke, tschüss!", ok: true, next: -1 }],
    },
  ];
}

writeFileSync(
  path.join(ROOT, "data/units-generated.json"),
  JSON.stringify(out, null, 2) + "\n",
);

console.log(`\nOK ${out.length} units -> data/units-generated.json`);
if (missingBlueprints)
  console.log(`  ${missingBlueprints} slots have no blueprint yet`);
