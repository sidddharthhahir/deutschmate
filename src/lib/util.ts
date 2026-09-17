/** Small generic helpers with no dependencies, shared across lib/ so each one has one home. */

/**
 * ä→a, ö→o, ü→u, ß→ss — nothing else, no case change. For stem comparison only:
 * never use this for grading, ä and a ARE different letters. Callers lowercase
 * first with whatever rule fits their input (locale-aware, plain, or already done).
 */
export function foldUmlauts(s: string): string {
  return s
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss");
}

/** Fisher-Yates. Does not mutate the input. */
export function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
