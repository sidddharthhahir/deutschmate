/**
 * What a call costs. Pure arithmetic, no database.
 *
 * Separated from cost.ts so it can be checked on its own: this is the one
 * place where being wrong produces a number that looks authoritative and
 * isn't, and a budget you can't trust is worse than no budget at all.
 */

/** USD per million tokens, at standard (non-promotional) rates. */
export const PRICES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-5": { in: 3.0, out: 15.0 },
  "claude-haiku-4-5": { in: 1.0, out: 5.0 },
};

/** Anthropic's cache multipliers: reads are cheap, writes cost a little extra. */
export const CACHE_READ = 0.1;
export const CACHE_WRITE = 1.25;

export type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/**
 * Cost of one call in millionths of a dollar.
 *
 * Millionths because a cached explanation costs a few hundredths of a cent,
 * and rounding those to cents would report a month of real usage as zero.
 */
export function priceOf(model: string, u: Usage): number {
  const p = PRICES[model];
  // An unknown model is recorded at zero rather than guessed. A wrong price is
  // worse than a missing one when the point is to trust the total.
  if (!p) return 0;

  const input = u.input_tokens ?? 0;
  const output = u.output_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;

  const dollars =
    (input * p.in +
      output * p.out +
      cacheRead * p.in * CACHE_READ +
      cacheWrite * p.in * CACHE_WRITE) /
    1_000_000;

  return Math.round(dollars * 1_000_000);
}
