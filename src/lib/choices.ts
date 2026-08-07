/**
 * The four options on a new-word recognition check.
 *
 * Extracted from the block because three separate bugs lived in the six lines
 * this replaces, and none of them were visible without walking the app:
 *
 *  1. The distractors were the first three other words of the day, so the first
 *     four cards of every session got the identical set. Sorted alphabetically
 *     on top of that, they also got it in the identical order — after card one
 *     you could answer without reading the German.
 *  2. Nothing checked the distractor against the answer, so "hallo · hello" was
 *     offered alongside "guten Tag · good day / hello" and marked wrong for
 *     picking the one that also says hello.
 *  3. The fix for (1) hashed the word id with an unbounded `n * 31 + c`, which
 *     passes 2^53 after a dozen characters — and every id is longer than that.
 *     `seed + k === seed` for small k, so every candidate was the same one and
 *     a card offered two options instead of four.
 *
 * Pure so it can be tested without a browser.
 */

/** The distinct meanings inside one gloss: "good day / hello" is two. */
export function senses(en: string): string[] {
  return en
    .toLowerCase()
    .split(/[/,;]| or /)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Bounded so it stays an exact integer however long the id is. */
function hash(s: string, start = 7): number {
  let n = start;
  for (const c of s) n = (n * 31 + c.charCodeAt(0)) % 100003;
  return n;
}

export type Choosable = { id: string; en: string };

/**
 * Up to four options, the right one among them, in an order that is stable for
 * a given word and different between words.
 *
 * Stable matters: an option that moves between renders is a misgrade waiting
 * to happen. Different matters: a fixed order is a pattern to learn instead of
 * the vocabulary.
 */
export function fourChoices(word: Choosable, pool: Choosable[]): string[] {
  const mine = new Set(senses(word.en));
  /* A distractor that shares any meaning with the answer is not a distractor,
     it is a second right answer. */
  const usable = pool.filter(
    (x) => x.id !== word.id && !senses(x.en).some((s) => mine.has(s)),
  );

  const seed = hash(word.id);
  const chosen: string[] = [];
  for (let k = 0; k < usable.length && chosen.length < 3; k++) {
    /* A rotation visits every candidate exactly once. A stride (`k * 7`) walks
       in circles whenever it shares a factor with the length. */
    const cand = usable[(seed + k) % usable.length].en;
    if (cand !== word.en && !chosen.includes(cand)) chosen.push(cand);
  }

  const rank = (s: string) => hash(s, seed);
  return [word.en, ...chosen].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  );
}
