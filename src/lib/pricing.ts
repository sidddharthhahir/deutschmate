import { catalogue, modelById } from "./models.ts";

/**
 * What a call costs. Arithmetic only — the numbers come from data/models.json.
 *
 * Separated from cost.ts so it can be checked on its own: this is the one place
 * where being wrong produces a figure that looks authoritative and isn't, and a
 * budget you cannot trust is worse than no budget at all.
 *
 * The rates used to be a literal in this file. They are data now because they
 * change underneath the app, and a stale price is a number principle 4 forbids —
 * see lib/models.ts.
 */

/** Which cache TTL a call used. The write multiplier differs; the read does not. */
export type CacheTtl = "5m" | "1h";

/**
 * The monthly ceiling, in dollars per learner.
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

/** True when this model has a price and a bill for it can be trusted. */
export function isPriced(model: string): boolean {
  return Boolean(modelById(model));
}

/**
 * Cost of one call in millionths of a dollar.
 *
 * Millionths because a cached explanation costs a few hundredths of a cent, and
 * rounding those to cents would report a month of real usage as zero.
 *
 * An unknown model still returns 0 — a guessed price is worse than a missing
 * one when the point is to trust the total — but `isPriced()` now exists so the
 * cost page can SAY that a call went unpriced instead of quietly folding a real
 * charge into a total that reads as complete.
 */
export function priceOf(model: string, u: Usage, ttl: CacheTtl = "1h"): number {
  const p = modelById(model);
  if (!p) return 0;

  const { cache } = catalogue();
  const input = u.input_tokens ?? 0;
  const output = u.output_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const writeMultiplier = ttl === "1h" ? cache.write_1h : cache.write_5m;

  const dollars =
    (input * p.in +
      output * p.out +
      cacheRead * p.in * cache.read +
      cacheWrite * p.in * writeMultiplier) /
    1_000_000;

  return Math.round(dollars * 1_000_000);
}
