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
  /**
   * The grammar point this unit teaches, or null when it teaches vocabulary.
   *
   * Null is an answer, not a gap: a unit about ordering in a restaurant has no
   * new rule in it, and inventing one would be padding.
   */
  grammar?: string | null;
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

/*
 * Words that a hand-written unit already teaches, and which must therefore stay
 * out of the pool this script spreads across the generated ones.
 *
 * This read units-a1-1.json alone. Then the A1 rewrite made all forty A1 units
 * hand-written and nobody added the second file, so A1.2's 238 words went into
 * the pool as well — taught once in their own A1.2 unit and again in whichever
 * A2 or B1 unit the cursor handed them to. It also skewed every unit size: the
 * last generated unit sweeps up the remainder, and the remainder was 238 words
 * too big.
 */
const HANDWRITTEN = new Set(
  [
    "data/units-a1-1.json",
    "data/units-a1-2.json",
    "data/units-a2-1.json",
    "data/units-a2-2.json",
    "data/units-b1-1.json",
  ]
    .filter((f) => existsSync(path.join(ROOT, f)))
    .flatMap(
      (f) =>
        JSON.parse(readFileSync(path.join(ROOT, f), "utf8")) as {
          words: string[];
        }[],
    )
    .flatMap((u) => u.words),
);

type Word = { id: string; level: string };

const out: unknown[] = [];
let missingBlueprints = 0;
let danglingGrammar = 0;

/** Every grammar id that exists, so a blueprint naming a typo is caught here. */
const grammarIds = new Set(
  (db.prepare("SELECT id FROM grammar").all() as { id: string }[]).map(
    (g) => g.id,
  ),
);

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

  const firstOrd = level === "A1.1" ? 13 : 1;

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

    /*
     * The point the blueprint names, not the next one off a shelf.
     *
     * This used to space the level's grammar points evenly — `floor(slots /
     * grammar.length)`, so units 1, 4, 7, 10, 13, 16 — which sounds fair and
     * put every single one on the wrong unit. B1.1 unit 2 is titled "Höflich
     * bitten · use Konjunktiv II to be polite" and got nothing; unit 4, about
     * the passive, got Konjunktiv II. Nobody saw it, because the blocks it fed
     * read their title from the unit and their content from the grammar row.
     *
     * A missing point is now silent by design and a wrong id is loud.
     */
    const grammarId = bp.grammar ?? null;
    if (grammarId && !grammarIds.has(grammarId)) {
      console.log(
        `  ! ${level} u${ord} "${bp.title}" names ${grammarId}, which nobody wrote`,
      );
      danglingGrammar++;
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

  const teaching = bps.filter((b) => b.grammar).length;
  console.log(
    `${level}: ${bps.length} units, ${placedHere} words, ` +
      `${teaching} teach a rule and ${bps.length - teaching} teach vocabulary`,
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
if (danglingGrammar)
  console.log(
    `  ${danglingGrammar} unit(s) name a grammar point nobody wrote — those teach no rule`,
  );
