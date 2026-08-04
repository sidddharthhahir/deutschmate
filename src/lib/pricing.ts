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

/**
 * Anthropic's cache multipliers: reads are cheap, writes cost a little extra.
 *
 * CACHE_WRITE is the 5-minute rate. The tutor prompt is written with a 1-hour
 * TTL, which is 2x rather than 1.25x — so this figure understates that one
 * write and overstates nothing. A whole session writes the prompt once and
 * reads it every turn after, so the difference is a fraction of a cent a day;
 * splitting the constant to chase it would cost more clarity than money.
 */
export const CACHE_READ = 0.1;
export const CACHE_WRITE = 1.25;

/**
 * The monthly ceiling, in dollars per user.
 *
 * Lives here rather than beside the spend queries because it is pure config and
 * because the guard that enforces it (lib/ai.ts) must not be able to disagree
 * with the bar the progress page draws.
 *
 * Set DEUTSCHMATE_BUDGET to change it. 0 is a real setting — it disables AI
 * spending entirely, which is a legitimate way to run this app: everything
 * except conversation, writing correction and new explanations works with no
 * key at all.
 */
export function ceiling(): number {
  const raw = process.env.DEUTSCHMATE_BUDGET;
  if (raw === undefined || raw.trim() === "") return 5;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

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
