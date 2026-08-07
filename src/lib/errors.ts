/* Extension spelled out, unlike the other db importers, so plain Node can load
   this file. classify() is the whole personalisation engine and had no test at
   all — three wrong labels reached a learner on day one — and it could not have
   one while importing this file meant resolving "./db" the way only the bundler
   does. getDb() is lazy, so importing costs nothing until something queries. */
import { all, get, run } from "./db.ts";
import { patternFor } from "./error-key.ts";
import { finiteIndex, looksFinite, orderTag } from "./finite-verb.ts";
import { TAG_EN, type Tag } from "./tags.ts";

/** Error tagging — the entire personalisation engine (spec §9). */

/* The names live in lib/tags.ts, which imports nothing, so the client
   components that show them can import it too — they each used to keep a
   private German copy and all three had drifted. */
export { TAG_EN as TAGS, type Tag } from "./tags.ts";

/*
 * Article forms, grouped by the case they mark, so a swap can be classified rather than lumped
 * under "wrong article".
 */
const NOMINATIVE = [
  "der",
  "die",
  "das",
  "ein",
  "eine",
  "kein",
  "keine",
  "mein",
  "meine",
];
const ACCUSATIVE = ["den", "einen", "keinen", "meinen", "diesen", "jeden"];
const DATIVE = [
  "dem",
  "einem",
  "einer",
  "keinem",
  "keiner",
  "meinem",
  "meiner",
  "diesem",
  "allen",
];
const GENITIVE = ["des", "eines", "einer", "dessen"];
const ARTICLES = [
  ...new Set([
    ...NOMINATIVE,
    ...ACCUSATIVE,
    ...DATIVE,
    ...GENITIVE,
    "dieser",
    "diese",
    "dieses",
    "jeder",
    "alle",
    "ihr",
    "ihre",
    "ihren",
    "dein",
    "deine",
    "sein",
    "seine",
    "unser",
    "unsere",
  ]),
];

/** Auxiliaries whose swap is a haben/sein decision, not a conjugation slip. */
const AUX = new Set([
  "hat",
  "ist",
  "habe",
  "bin",
  "haben",
  "sind",
  "hast",
  "bist",
  "habt",
  "seid",
  "hatte",
  "war",
  "hatten",
  "waren",
]);
const HABEN = new Set([
  "hat",
  "habe",
  "haben",
  "hast",
  "habt",
  "hatte",
  "hatten",
]);

/** Prepositions common enough at A1–B1 that a swap is worth naming. */
const PREPOSITIONS = new Set([
  "in",
  "an",
  "auf",
  "über",
  "unter",
  "vor",
  "hinter",
  "neben",
  "zwischen",
  "mit",
  "nach",
  "bei",
  "seit",
  "von",
  "zu",
  "aus",
  "außer",
  "gegenüber",
  "für",
  "um",
  "durch",
  "gegen",
  "ohne",
  "bis",
  "im",
  "am",
  "zum",
  "zur",
  "ins",
  "ans",
  "beim",
  "vom",
]);

/** Classify a wrong answer by comparing it to the expected one. */
export function classify(expected: string, got: string): Tag[] {
  const tags = new Set<Tag>();
  const e = expected.trim();
  const g = got.trim();
  if (!g || e.toLowerCase() === g.toLowerCase()) return [];

  const eW = e.split(/\s+/);
  const gW = g.split(/\s+/);

  /* Same words, different order → word order problem.
   *
   * Compared with the punctuation removed. It used to be compared raw, so
   * "Tschüss, bis morgen!" against "bis morgen Tschüss,!" was not the same
   * multiset — the exclamation mark had moved with the word — and a plain
   * reordering fell past this branch to be labelled `vocabulary`. Three of
   * four word-order mistakes in one session were filed as wrong-word-chosen,
   * which is also what the Fix block then drilled. error-key.ts always
   * stripped, so the two classifiers disagreed about the same answer. */
  const bare = (a: string[]) =>
    a
      .map((x) => x.replace(/[.,!?;:„""»«…]/g, "").toLowerCase())
      .filter(Boolean);
  const eB = bare(eW);
  const gB = bare(gW);
  const sorted = (a: string[]) => [...a].sort().join(" ");
  if (eB.length === gB.length && sorted(eB) === sorted(gB)) {
    tags.add(orderTag(eW, gW));
  }

  /* Where the conjugated verb is in the sentence they were aiming at, or -1
     when none can be identified. Used by the verb-ending rule below. */
  const verbAt = finiteIndex(eW);

  /* Article swaps, named by the case that was actually wanted. */
  for (let i = 0; i < Math.min(eW.length, gW.length); i++) {
    const want = eW[i].toLowerCase();
    const wrote = gW[i].toLowerCase();
    if (want === wrote) continue;
    if (!ARTICLES.includes(want) || !ARTICLES.includes(wrote)) continue;
    if (GENITIVE.includes(want) && !GENITIVE.includes(wrote))
      tags.add("article-genitiv");
    else if (DATIVE.includes(want) && !DATIVE.includes(wrote))
      tags.add("article-dativ");
    else if (ACCUSATIVE.includes(want) && !ACCUSATIVE.includes(wrote))
      tags.add("article-akkusativ");
    else tags.add("article-gender");
  }

  for (let i = 0; i < Math.min(eW.length, gW.length); i++) {
    const want = eW[i].toLowerCase();
    const wrote = gW[i].toLowerCase();
    if (want === wrote) continue;

    // haben or sein in the perfect: a decision about the verb, not an ending.
    if (
      AUX.has(want) &&
      AUX.has(wrote) &&
      HABEN.has(want) !== HABEN.has(wrote)
    ) {
      tags.add("perfekt-hilfsverb");
      continue;
    }

    // A preposition swapped for another preposition.
    if (PREPOSITIONS.has(want) && PREPOSITIONS.has(wrote)) {
      tags.add("praeposition");
      continue;
    }

    /* Verb ending: same stem, different tail — at the position where the verb
     * actually is.
     *
     * This asked only that the first `min(len)-2` characters matched, which
     * for two four-letter words is two characters, so "Guten" against "Gute"
     * was filed as a wrong verb ending — and so would "Haus" against "Hand".
     * Morphology alone cannot separate them: -e and -en are both verb person
     * endings and adjective declensions, so `guten` looks exactly as finite as
     * `gehst`. Position can. A finite verb sits where finiteIndex finds it;
     * `Guten` sits at index 0 in front of a capitalised noun, and that clause
     * has no verb at all.
     *
     * Worth the care: the top three tags become tomorrow's Fix drills, so this
     * had a beginner drilling conjugation for picking the wrong greeting. */
    if (want.length < 3 || wrote.length < 3) continue;
    if (i !== verbAt || !looksFinite(want) || !looksFinite(wrote)) continue;
    const stem = Math.min(want.length, wrote.length) - 2;
    if (stem > 1 && want.slice(0, stem) === wrote.slice(0, stem))
      tags.add("verb-ending");
  }

  // Umlaut / ß differences only → spelling.
  const fold = (s: string) =>
    s
      .toLowerCase()
      .replace(/ä/g, "a")
      .replace(/ö/g, "o")
      .replace(/ü/g, "u")
      .replace(/ß/g, "ss");
  if (fold(e) === fold(g)) tags.add("spelling");

  // Lowercased a noun.
  for (let i = 0; i < Math.min(eW.length, gW.length); i++) {
    if (eW[i] !== gW[i] && eW[i].toLowerCase() === gW[i].toLowerCase()) {
      if (/^[A-ZÄÖÜ]/.test(eW[i])) tags.add("capitalisation");
    }
  }

  if (
    /\b(nicht|kein|keine|keinen)\b/i.test(e) &&
    /\b(nicht|kein|keine|keinen)\b/i.test(g)
  ) {
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
  const tags =
    opts.tags ??
    (opts.correct ? [] : classify(opts.expected ?? "", opts.answer ?? ""));
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
  return (
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      /* `label` is English because its consumers are the AI coaching brief and
       the rule tier of an explanation. Screens use TAG_DE — see lib/tags.ts
       for why there are two and which belongs where. */
      .map(([tag, n]) => ({ tag, n, label: TAG_EN[tag as Tag] ?? tag }))
  );
}

/**
 * Write-through cache for explanations (spec §12). Look up first; only call a model on a miss,
 * then store the result so the second person to make this mistake gets it free.
 */
export function cachedExplanation(signature: string) {
  const row = get<{ explain_md: string }>(
    "SELECT explain_md FROM error_pattern WHERE signature = ?",
    signature,
  );
  if (row) {
    run(
      "UPDATE error_pattern SET hits = hits + 1 WHERE signature = ?",
      signature,
    );
    return row.explain_md;
  }
  return null;
}

/** The prebuilt explanation for a mistake, most specific first. */
export function patternExplanation(expected: string, got: string, tags: Tag[]) {
  const keys = [
    patternFor(expected, got),
    ...tags.map((t) => `tag:${t}`),
  ].filter((k): k is string => Boolean(k));
  for (const key of keys) {
    const hit = cachedExplanation(key);
    if (hit) return hit;
  }
  return null;
}

/**
 * Write a mistake explanation into the shared pool. But a shared row with no author cannot be
 * withdrawn, and after BYO keys somebody's money is behind each one.
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
export { signatureFor } from "./error-key.ts";
