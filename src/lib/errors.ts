import { all, get, run } from "./db";

/**
 * Error tagging — the entire personalisation engine (spec §9).
 *
 * Every wrong answer gets classified into a small set of stable tags. Tomorrow's
 * Fix block is one GROUP BY over those tags. No ML, no embeddings: counting
 * mistakes IS adaptive learning, and it stays debuggable.
 */

export const TAGS = {
  "article-gender": "Wrong article (der/die/das)",
  "article-akkusativ": "Nominative article where accusative is needed",
  "verb-ending": "Wrong verb ending for the subject",
  "verb-position-2": "Verb not in second position",
  "verb-final": "Infinitive not at the end after a modal",
  "plural": "Wrong plural form",
  "negation": "nicht vs kein",
  "pronoun": "Wrong pronoun (du / Sie / ihr)",
  "capitalisation": "Nouns are capitalised in German",
  "spelling": "Spelling — often umlaut or ß",
  "word-order": "Word order",
  "vocabulary": "Wrong word chosen",
} as const;

export type Tag = keyof typeof TAGS;

const ARTICLES = ["der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem"];

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

  // Article swaps.
  for (let i = 0; i < Math.min(eW.length, gW.length); i++) {
    const a = eW[i].toLowerCase();
    const b = gW[i].toLowerCase();
    if (a === b) continue;
    if (ARTICLES.includes(a) && ARTICLES.includes(b)) {
      const accPair =
        (a === "den" && b === "der") ||
        (a === "einen" && b === "ein") ||
        (a === "der" && b === "den");
      tags.add(accPair ? "article-akkusativ" : "article-gender");
    }
  }

  // Verb ending: same stem, different tail.
  for (let i = 0; i < Math.min(eW.length, gW.length); i++) {
    const a = eW[i].toLowerCase();
    const b = gW[i].toLowerCase();
    if (a === b || a.length < 3 || b.length < 3) continue;
    const stem = Math.min(a.length, b.length) - 2;
    if (stem > 1 && a.slice(0, stem) === b.slice(0, stem) && a !== b) {
      tags.add("verb-ending");
    }
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
    .map(([tag, n]) => ({ tag, n, label: TAGS[tag as Tag] ?? tag }));
}

/**
 * Write-through cache for explanations (spec §12). Look up first; only call a
 * model on a miss, then store the result so the second person to make this
 * mistake gets it free. German learners make a finite set of mistakes, so this
 * table converges and the live-call cost decays toward zero.
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

export function storeExplanation(tag: string, signature: string, md: string, source = "generated") {
  run(
    `INSERT INTO error_pattern (tag, signature, explain_md, source, hits)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(signature) DO UPDATE SET hits = hits + 1`,
    tag,
    signature,
    md,
    source,
  );
}

export function signatureFor(expected: string, got: string) {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?]$/, "");
  return `${norm(expected)}|${norm(got)}`;
}
