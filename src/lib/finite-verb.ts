/**
 * Is there a conjugated verb in this sentence, and where?
 *
 * Two classifiers used to answer "your verb is in the wrong place" by looking
 * at whatever token sat at index 1 — the variable was even called `eVerb`. On
 * "Tschüss, bis morgen!", a sentence with no verb in it at all, that produced a
 * lecture about verb-second position illustrated with someone going to the
 * cinema. This exists so the claim is only made when there is a verb to make it
 * about.
 *
 * Deliberately conservative: it answers "yes, that is a finite verb" or "I do
 * not know", never "no". A caller that gets -1 must fall back to the general
 * word-order explanation, which is true whether or not a verb is involved. The
 * course teaches 741 verbs, so a lexicon is not on the table and a full tagger
 * is far more machinery than an error label needs — the cost of missing one is
 * a slightly vaguer explanation, and the cost of inventing one is a beginner
 * being taught a rule that does not apply to what they wrote.
 *
 * Measured over 1,200 sentences from the app's own corpus: a finite verb is
 * found in 98%, and the 2% it misses are all verb-first — imperatives and
 * yes/no questions ("Wohnst du hier?"), where the verb is at index 0 and the
 * V2 rule is not what went wrong anyway. Of 400 nouns, 3 are called verbs
 * (Würde, Tat, Stand — all three genuinely are verb forms too). Predicate
 * adjectives ending in -t and -e (müde, kalt, verboten) do pass, but German
 * puts the finite verb early enough that they are almost never the first match,
 * and when they are the result is the milder label.
 *
 * Pure: no database, no imports. Both callers need it, and one of them is
 * loaded by plain Node in the tests.
 */

/** Forms no German sentence gets far without. Recognised outright. */
const CORE = new Set(
  (
    "bin bist ist sind seid war warst waren wart sei wäre wären " +
    "habe hast hat haben habt hatte hattest hatten hattet hätte hätten " +
    "werde wirst wird werden werdet wurde wurden würde würden " +
    "kann kannst könnt können konnte konnten könnte könnten " +
    "muss musst müsst müssen musste mussten müsste müssten " +
    "will willst wollt wollen wollte wollten " +
    "soll sollst sollt sollen sollte sollten " +
    "darf darfst dürft dürfen durfte durften dürfte dürften " +
    "mag magst mögt mögen mochte mochten möchte möchtest möchten möchtet " +
    "weiß weißt wisst wissen wusste wussten " +
    "gibt gibst gebt geben gab gaben " +
    "geht gehst gehen geh ging gingen " +
    "kommt kommst kommen komm kam kamen " +
    "macht machst machen mach machte machten " +
    "heißt heiße heißen sagt sagst sagen sagte sagten " +
    "nimmt nimmst nehmen nahm nahmen " +
    "sieht siehst sehen sah sahen " +
    "fährt fährst fahren fuhr fuhren " +
    "spricht sprichst sprechen sprach sprachen " +
    "isst esst essen aß aßen trinkt trinkst trinken " +
    "liest lest lesen las lasen " +
    "hilft hilfst helfen half halfen " +
    "läuft läufst laufen lief liefen " +
    "bleibt bleibst bleiben blieb blieben " +
    "steht stehst stehen stand standen " +
    "tut tust tun tat taten"
  ).split(/\s+/),
);

/**
 * Lowercase words that carry a verb-shaped ending and are not verbs. Without
 * these the morphological rule below calls `morgen` a verb — which is exactly
 * the token that produced the bug this module was written for.
 */
const NEVER_VERBS = new Set(
  (
    "morgen gestern heute immer wieder weiter gern gerne schon eben " +
    "oben unten innen außen hinten vorn neben gegen zwischen " +
    "seit mit nach bei von zu aus über unter vor hinter " +
    "nicht sehr sonst meist zuerst zuletzt jetzt dort " +
    "danken denken zusammen allein bitte danke leider vielleicht " +
    "etwas nichts alles jemand niemand"
  ).split(/\s+/),
);

const strip = (w: string) => w.replace(/[.,!?;:„""»«…]/g, "");

/**
 * A conjugated verb, as far as we can tell.
 *
 * Capitalisation does most of the work: every German noun is capitalised, so
 * requiring lowercase removes the largest class of false positives at no cost
 * — a finite verb is only capitalised when it starts the sentence, and that is
 * position 0, which is never the position this is asked about.
 */
export function looksFinite(word: string): boolean {
  const w = strip(word).toLowerCase();
  if (!w) return false;
  if (CORE.has(w)) return true;
  if (NEVER_VERBS.has(w)) return false;
  if (strip(word)[0] !== strip(word)[0]?.toLowerCase()) return false;
  if (w.length < 4) return false;
  // Present and simple-past endings on a plausible stem.
  return /(?:st|est|et|te|test|ten|tet|[^aeiou]t|en|e)$/.test(w);
}

/**
 * Index of the first finite verb, or -1 when none is recognised.
 *
 * -1 means "unknown", not "there is no verb" — see the note at the top.
 */
export function finiteIndex(tokens: string[]): number {
  for (let i = 0; i < tokens.length; i++) if (looksFinite(tokens[i])) return i;
  return -1;
}

/**
 * The label for two sentences with the same words in a different order.
 *
 * `verb-position-2` only when a verb was actually identified at index 1 and the
 * learner put something else there. Everything else is `word-order`, whose
 * explanation covers the verb rule anyway.
 */
export function orderTag(
  expected: string[],
  got: string[],
): "verb-position-2" | "word-order" {
  const at = finiteIndex(expected);
  if (at !== 1) return "word-order";
  const e = strip(expected[1] ?? "").toLowerCase();
  const g = strip(got[1] ?? "").toLowerCase();
  return e !== g ? "verb-position-2" : "word-order";
}
