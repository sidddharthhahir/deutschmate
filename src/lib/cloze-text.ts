/**
 * Choosing where the gap goes. Pure string work — no database, no imports.
 *
 * Separated from cloze.ts so this can be exercised on its own: it is the part
 * with all the edge cases (punctuation, umlauts, inflection, near-misses that
 * must NOT become a card) and none of the I/O.
 */

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/** Strip leading/trailing punctuation, keeping the word itself intact. */
export const bare = (t: string) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

const same = (a: string, b: string) =>
  bare(a).toLocaleLowerCase("de") === bare(b).toLocaleLowerCase("de");

/**
 * Lowercase and flatten umlauts, for stem comparison only.
 *
 * German inflection umlauts the stem — Haus/Häuser, Buch/Bücher, groß/größer.
 * A prefix match that respects umlauts therefore misses exactly the words a
 * learner most needs blanked. Never use this for grading: ä and a ARE different
 * letters, and "Hauser" is wrong.
 */
const fold = (s: string) =>
  s
    .toLocaleLowerCase("de")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss");

export type Gap = { sentence: string; answer: string };

/**
 * Blank one token of a sentence, keeping its punctuation.
 * "Ich esse einen Apfel." + index 2 → "Ich esse ___ Apfel."
 */
export function blankAt(sentence: string, index: number): Gap | null {
  const w = words(sentence);
  const tok = w[index];
  if (!tok) return null;
  const answer = bare(tok);
  if (!answer || answer.length > 24) return null;
  w[index] = tok.replace(answer, "___");
  return { sentence: w.join(" "), answer };
}

/**
 * Blank a given word where it appears in a sentence.
 *
 * Exact match first, then a stem match — an example sentence almost never
 * contains the bare lemma ("Häuser", "gehst", "größten"), so an exact-only
 * match would fail on most words and quietly do nothing.
 */
export function blankWord(sentence: string, word: string): Gap | null {
  const w = words(sentence);
  const exact = w.findIndex((t) => same(t, word));
  if (exact !== -1) return blankAt(sentence, exact);

  const stem = fold(bare(word)).slice(0, 4);
  if (stem.length < 4) return null;
  const near = w.findIndex((t) => fold(bare(t)).startsWith(stem));
  return near === -1 ? null : blankAt(sentence, near);
}

/**
 * Work out which single token the learner got wrong.
 *
 * Handles the two cases worth drilling:
 *   substitution  "einen" → "ein"      (same length, one index differs)
 *   omission      "einen" → (dropped)  (expected is one token longer)
 *
 * Anything else — reordering, two or more substitutions, a rewrite — returns
 * null. Blanking one word of those would test the wrong thing.
 */
export function blankForError(expected: string, got: string): Gap | null {
  const e = words(expected);
  const g = words(got);
  if (!e.length || !g.length) return null;

  if (e.length === g.length) {
    const diffs = e.map((_, i) => i).filter((i) => !same(e[i], g[i]));
    return diffs.length === 1 ? blankAt(expected, diffs[0]) : null;
  }

  if (e.length === g.length + 1) {
    for (let i = 0; i < e.length; i++) {
      const without = [...e.slice(0, i), ...e.slice(i + 1)];
      if (without.every((t, k) => same(t, g[k]))) return blankAt(expected, i);
    }
  }

  return null;
}
