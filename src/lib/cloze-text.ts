/** Choosing where the gap goes. */

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/** Strip leading/trailing punctuation, keeping the word itself intact. */
export const bare = (t: string) =>
  t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

const same = (a: string, b: string) =>
  bare(a).toLocaleLowerCase("de") === bare(b).toLocaleLowerCase("de");

/**
 * Lowercase and flatten umlauts, for stem comparison only. Never use this for grading: ä and a ARE
 * different letters, and "Hauser" is wrong.
 */
const fold = (s: string) =>
  s
    .toLocaleLowerCase("de")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss");

export type Gap = { sentence: string; answer: string };

/** Blank one token of a sentence, keeping its punctuation. */
export function blankAt(sentence: string, index: number): Gap | null {
  const w = words(sentence);
  const tok = w[index];
  if (!tok) return null;
  const answer = bare(tok);
  if (!answer || answer.length > 24) return null;
  w[index] = tok.replace(answer, "___");
  return { sentence: w.join(" "), answer };
}

/** Blank a given word where it appears in a sentence. */
export function blankWord(sentence: string, word: string): Gap | null {
  const w = words(sentence);
  const exact = w.findIndex((t) => same(t, word));
  if (exact !== -1) return blankAt(sentence, exact);

  const stem = fold(bare(word)).slice(0, 4);
  if (stem.length < 4) return null;
  const near = w.findIndex((t) => fold(bare(t)).startsWith(stem));
  return near === -1 ? null : blankAt(sentence, near);
}

/** Work out which single token the learner got wrong. */
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
