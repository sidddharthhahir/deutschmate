/**
 * Two keys for one mistake: `signatureFor` is the exact sentence pair (learned, has
 * a `|`), `patternFor` is the difference alone (prebuilt, never has one). A pattern
 * explanation must be true WITHOUT seeing the sentence — "'Mann' is masculine" is a
 * lie the moment the same key fires on a Frau — so live model output is stored under
 * the sentence key only.
 */

/** Same normalisation both keys use. */
export function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");
}

export function signatureFor(expected: string, got: string): string {
  return `${norm(expected)}|${norm(got)}`;
}

const strip = (w: string) => w.replace(/[.,!?;:„""»«]/g, "");

/** Contracted prepositions collapse to the preposition they contain. */
const CONTRACTIONS: Record<string, string> = {
  zum: "zu",
  zur: "zu",
  ins: "in",
  im: "in",
  ans: "an",
  am: "an",
  aufs: "auf",
  beim: "bei",
  vom: "von",
  fürs: "für",
  durchs: "durch",
  ums: "um",
  übers: "über",
  unters: "unter",
  vors: "vor",
  hinters: "hinter",
};

/** Words that are never conjugated, so a shared stem between two of them means nothing. */
const CLOSED_CLASS = new Set([
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "dass",
  "ein",
  "eine",
  "einen",
  "einem",
  "einer",
  "eines",
  "kein",
  "keine",
  "keinen",
  "keinem",
  "keiner",
  "keins",
  "mein",
  "meine",
  "meinen",
  "meinem",
  "meiner",
  "meins",
  "dein",
  "deine",
  "deinen",
  "deinem",
  "deiner",
  "sein",
  "seine",
  "seinen",
  "seinem",
  "seiner",
  "ihr",
  "ihre",
  "ihren",
  "ihrem",
  "ihrer",
  "unser",
  "unsere",
  "unseren",
  "unserem",
  "unserer",
  "euer",
  "eure",
  "euren",
  "eurem",
  "eurer",
  "dieser",
  "diese",
  "dieses",
  "diesen",
  "diesem",
  "jeder",
  "jede",
  "jedes",
  "jeden",
  "jedem",
  "welcher",
  "welche",
  "welches",
  "welchen",
  "welchem",
  "alle",
  "allen",
  "aller",
  "alles",
  "ich",
  "du",
  "er",
  "sie",
  "es",
  "wir",
  "man",
  "mich",
  "dich",
  "sich",
  "uns",
  "euch",
  "ihn",
  "ihm",
  "ihnen",
  "mir",
  "dir",
  "nicht",
  "nichts",
  "nein",
  "kein",
  ...Object.keys(CONTRACTIONS),
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
  "und",
  "oder",
  "aber",
  "denn",
  "sondern",
  "weil",
  "wenn",
  "als",
  "wann",
  "ob",
  "dass",
  "da",
  "damit",
  "obwohl",
  "während",
  "wie",
  "wo",
  "wer",
  "was",
  "warum",
  "wieso",
  "schon",
  "noch",
  "erst",
  "nur",
  "auch",
  "sehr",
  "viel",
  "mehr",
  "immer",
  "oft",
  "manchmal",
  "nie",
  "gern",
  "lieber",
  "so",
  "also",
  "sonst",
]);

/** Every ending a German verb can carry, present and simple past. */
const ENDINGS = new Set([
  "",
  "e",
  "st",
  "t",
  "en",
  "n",
  "et",
  "est",
  "te",
  "test",
  "tet",
  "ten",
]);

/** The word-pair key. Exported so the seeder builds keys the same way. */
export function wordKey(wrong: string, right: string): string {
  const c = (w: string) => {
    const lower = w.toLowerCase();
    return CONTRACTIONS[lower] ?? lower;
  };
  return `w:${c(wrong)}→${c(right)}`;
}

const fold = (s: string) =>
  s
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss");

/** The longest shared prefix of two words, in characters. */
function sharedPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** The pattern key for a wrong answer, or null when the difference is not one that generalises. */
export function patternFor(expected: string, got: string): string | null {
  // Tokenised once, keeping the original case: the capitalisation check below
  // is the one thing `norm` would destroy.
  const eRaw = expected.trim().split(/\s+/).map(strip).filter(Boolean);
  const gRaw = got.trim().split(/\s+/).map(strip).filter(Boolean);
  if (!eRaw.length || !gRaw.length) return null;

  const eW = eRaw.map((w) => w.toLowerCase());
  const gW = gRaw.map((w) => w.toLowerCase());
  if (eW.join(" ") === gW.join(" ") && eRaw.join(" ") === gRaw.join(" "))
    return null;

  if (eW.length !== gW.length) return null;

  // Same words, different order — one lesson, and it is about position.
  const sorted = (a: string[]) => [...a].sort().join(" ");
  if (sorted(eW) === sorted(gW) && eW.join(" ") !== gW.join(" ")) {
    return eW[1] !== gW[1] ? "order:verb-position-2" : "order:word-order";
  }

  // Exactly one word differs. Everything below depends on this.
  const diff: number[] = [];
  for (let i = 0; i < eRaw.length; i++) if (eRaw[i] !== gRaw[i]) diff.push(i);
  if (diff.length !== 1) return null;

  const at = diff[0];
  const right = eW[at];
  const wrong = gW[at];

  // Only the capital letter changed.
  if (right === wrong) return "case";

  // Only an umlaut or an ß. Spelling, not grammar, whatever the words are.
  if (fold(right) === fold(wrong)) return "sp:umlaut";

  /*
   * A shared stem with two short tails is a verb ending — the lesson is the ending, not the verb,
   * so `gehe→gehst` and `mache→machst` are one entry.
   */
  if (!CLOSED_CLASS.has(wrong) && !CLOSED_CLASS.has(right)) {
    const shared = sharedPrefix(wrong, right);
    const tailW = wrong.slice(shared);
    const tailR = right.slice(shared);
    if (shared >= 3 && ENDINGS.has(tailW) && ENDINGS.has(tailR)) {
      return `v:-${tailW || "∅"}→-${tailR || "∅"}`;
    }
  }

  return wordKey(wrong, right);
}
