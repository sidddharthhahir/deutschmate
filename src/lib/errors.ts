import { all, get, run } from "./db";
import { patternFor } from "./error-key.ts";
import { TAG_EN, type Tag } from "./tags.ts";

/**
 * Error tagging — the entire personalisation engine (spec §9).
 *
 * Every wrong answer gets classified into a small set of stable tags. Tomorrow's
 * Fix block is one GROUP BY over those tags. No ML, no embeddings: counting
 * mistakes IS adaptive learning, and it stays debuggable.
 */

/* The names live in lib/tags.ts, which imports nothing, so the client
   components that show them can import it too — they each used to keep a
   private German copy and all three had drifted. */
export { TAG_EN as TAGS, TAG_DE, de, en, type Tag } from "./tags.ts";

/* Article forms, grouped by the case they mark, so a swap can be classified
   rather than lumped under "wrong article". The dative set is what makes
   `article-dativ` detectable at all: the previous classifier had two article
   tags and folded every dative slip into "wrong gender", which is the one
   thing it is not. */
const NOMINATIVE = ["der", "die", "das", "ein", "eine", "kein", "keine", "mein", "meine"];
const ACCUSATIVE = ["den", "einen", "keinen", "meinen", "diesen", "jeden"];
const DATIVE = ["dem", "einem", "einer", "keinem", "keiner", "meinem", "meiner", "diesem", "allen"];
const GENITIVE = ["des", "eines", "einer", "dessen"];
const ARTICLES = [...new Set([...NOMINATIVE, ...ACCUSATIVE, ...DATIVE, ...GENITIVE, "dieser", "diese", "dieses", "jeder", "alle", "ihr", "ihre", "ihren", "dein", "deine", "sein", "seine", "unser", "unsere"])];

/** Auxiliaries whose swap is a haben/sein decision, not a conjugation slip. */
const AUX = new Set([
  "hat", "ist", "habe", "bin", "haben", "sind", "hast", "bist", "habt", "seid",
  "hatte", "war", "hatten", "waren",
]);
const HABEN = new Set(["hat", "habe", "haben", "hast", "habt", "hatte", "hatten"]);

/** Prepositions common enough at A1–B1 that a swap is worth naming. */
const PREPOSITIONS = new Set([
  "in", "an", "auf", "über", "unter", "vor", "hinter", "neben", "zwischen",
  "mit", "nach", "bei", "seit", "von", "zu", "aus", "außer", "gegenüber",
  "für", "um", "durch", "gegen", "ohne", "bis",
  "im", "am", "zum", "zur", "ins", "ans", "beim", "vom",
]);

/**
 * Classify a wrong answer by comparing it to the expected one.
 *
 * Deliberately rule-based, not a model call: these patterns cover the large
 * majority of beginner mistakes, they run offline, and they cost nothing.
 * Anything unmatched falls through to the write-through cache (spec §12).
 */
export function classify(expected: string, got: string): Tag[] {
  const tags = new Set<Tag>();
  const e = expected.trim();
  const g = got.trim();
  if (!g || e.toLowerCase() === g.toLowerCase()) return [];

  const eW = e.split(/\s+/);
  const gW = g.split(/\s+/);

  // Same words, different order → word order problem.
  const sorted = (a: string[]) => [...a].map((x) => x.toLowerCase()).sort().join(" ");
  if (eW.length === gW.length && sorted(eW) === sorted(gW)) {
    const eVerb = eW[1]?.toLowerCase();
    const gVerb = gW[1]?.toLowerCase();
    tags.add(eVerb !== gVerb ? "verb-position-2" : "word-order");
  }

  /* Article swaps, named by the case that was actually wanted.
     This used to be two outcomes — "accusative" for three hardcoded pairs and
     "wrong gender" for everything else — so `mit der Mann` was reported as a
     gender mistake when the gender was right and the case was not. The
     prebuilt explanations are keyed per pair, but the tag is what the Fix
     block and /fehler group by, so it has to be the real one. */
  for (let i = 0; i < Math.min(eW.length, gW.length); i++) {
    const want = eW[i].toLowerCase();
    const wrote = gW[i].toLowerCase();
    if (want === wrote) continue;
    if (!ARTICLES.includes(want) || !ARTICLES.includes(wrote)) continue;
    if (GENITIVE.includes(want) && !GENITIVE.includes(wrote)) tags.add("article-genitiv");
    else if (DATIVE.includes(want) && !DATIVE.includes(wrote)) tags.add("article-dativ");
    else if (ACCUSATIVE.includes(want) && !ACCUSATIVE.includes(wrote))
      tags.add("article-akkusativ");
    else tags.add("article-gender");
  }

  for (let i = 0; i < Math.min(eW.length, gW.length); i++) {
    const want = eW[i].toLowerCase();
    const wrote = gW[i].toLowerCase();
    if (want === wrote) continue;

    // haben or sein in the perfect: a decision about the verb, not an ending.
    if (AUX.has(want) && AUX.has(wrote) && HABEN.has(want) !== HABEN.has(wrote)) {
      tags.add("perfekt-hilfsverb");
      continue;
    }

    // A preposition swapped for another preposition.
    if (PREPOSITIONS.has(want) && PREPOSITIONS.has(wrote)) {
      tags.add("praeposition");
      continue;
    }

    // Verb ending: same stem, different tail.
    if (want.length < 3 || wrote.length < 3) continue;
    const stem = Math.min(want.length, wrote.length) - 2;
    if (stem > 1 && want.slice(0, stem) === wrote.slice(0, stem)) tags.add("verb-ending");
  }

  // Umlaut / ß differences only → spelling.
  const fold = (s: string) =>
    s.toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss");
  if (fold(e) === fold(g)) tags.add("spelling");

  // Lowercased a noun.
  for (let i = 0; i < Math.min(eW.length, gW.length); i++) {
    if (eW[i] !== gW[i] && eW[i].toLowerCase() === gW[i].toLowerCase()) {
      if (/^[A-ZÄÖÜ]/.test(eW[i])) tags.add("capitalisation");
    }
  }

  if (/\b(nicht|kein|keine|keinen)\b/i.test(e) && /\b(nicht|kein|keine|keinen)\b/i.test(g)) {
    const eN = /\bnicht\b/i.test(e);
    const gN = /\bnicht\b/i.test(g);
    if (eN !== gN) tags.add("negation");
  }

  if (!tags.size) tags.add("vocabulary");
  return [...tags];
}

export function logAttempt(opts: {
  userId: string;
  kind: string;
  refId?: string | null;
  correct: boolean;
  answer?: string;
  expected?: string;
  tags?: Tag[];
}) {
  const tags = opts.tags ?? (opts.correct ? [] : classify(opts.expected ?? "", opts.answer ?? ""));
  run(
    `INSERT INTO attempt (user_id, kind, ref_id, correct, user_answer, expected, error_tags_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    opts.userId,
    opts.kind,
    opts.refId ?? null,
    opts.correct ? 1 : 0,
    opts.answer ?? null,
    opts.expected ?? null,
    JSON.stringify(tags),
  );
  return tags;
}

/** The three tags to drill tomorrow. Spec §9 — this is the whole engine. */
export function topErrorTags(userId: string, days = 14, limit = 3) {
  const rows = all<{ error_tags_json: string }>(
    `SELECT error_tags_json FROM attempt
      WHERE user_id = ? AND correct = 0
        AND created_at > datetime('now', ?)`,
    userId,
    `-${days} days`,
  );
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const t of JSON.parse(r.error_tags_json) as string[]) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    /* `label` is English because its consumers are the AI coaching brief and
       the rule tier of an explanation. Screens use TAG_DE — see lib/tags.ts
       for why there are two and which belongs where. */
    .map(([tag, n]) => ({ tag, n, label: TAG_EN[tag as Tag] ?? tag }));
}

/**
 * Write-through cache for explanations (spec §12). Look up first; only call a
 * model on a miss, then store the result so the second person to make this
 * mistake gets it free. German learners make a finite set of mistakes, so this
 * table converges and the live-call cost decays toward zero.
 *
 * Two kinds of row live here, distinguished by their signature and by `source`:
 * exact sentence pairs, written back from live calls, and the general patterns
 * in `data/error-patterns.json`, seeded with `source = 'prebuilt'`. See
 * lib/error-key.ts for why the second kind needs a different key.
 */
export function cachedExplanation(signature: string) {
  const row = get<{ explain_md: string }>(
    "SELECT explain_md FROM error_pattern WHERE signature = ?",
    signature,
  );
  if (row) {
    run("UPDATE error_pattern SET hits = hits + 1 WHERE signature = ?", signature);
    return row.explain_md;
  }
  return null;
}

/**
 * The prebuilt explanation for a mistake, most specific first.
 *
 * `w:der→den` before `tag:article-akkusativ`: naming the exact pair is worth
 * more than naming the case, and the per-tag rows exist so that something true
 * is always available even for a pair nobody wrote down.
 */
export function patternExplanation(expected: string, got: string, tags: Tag[]) {
  const keys = [patternFor(expected, got), ...tags.map((t) => `tag:${t}`)].filter(
    (k): k is string => Boolean(k),
  );
  for (const key of keys) {
    const hit = cachedExplanation(key);
    if (hit) return hit;
  }
  return null;
}

/**
 * Write a mistake explanation into the shared pool.
 *
 * `createdBy` is who paid for it. These rows stay global — a mistake signature
 * is a pair of short answer fragments, not somebody's prose, and an explanation
 * of "der → den" is the right answer for whoever makes it next. But a shared
 * row with no author cannot be withdrawn, and after BYO keys somebody's money
 * is behind each one. NULL means prebuilt: shipped with the app, cost nobody
 * anything, and never deletable as a "contribution".
 */
export function storeExplanation(
  tag: string,
  signature: string,
  md: string,
  source = "generated",
  createdBy: string | null = null,
) {
  run(
    `INSERT INTO error_pattern (tag, signature, explain_md, source, created_by, hits)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(signature) DO UPDATE SET hits = hits + 1`,
    tag,
    signature,
    md,
    source,
    createdBy,
  );
}

/* Both keys live in lib/error-key.ts — a pure module, so the rules that decide
   what counts as "the same mistake" can be tested without a database. */
export { signatureFor, patternFor } from "./error-key.ts";
