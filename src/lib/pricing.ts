import { catalogue, modelById } from "./models.ts";

/** What a call costs. Arithmetic only — the numbers come from data/models.json. */

/** Which cache TTL a call used. The write multiplier differs; the read does not. */
export type CacheTtl = "5m" | "1h";

/** The monthly ceiling, in dollars per learner. */
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

/** Cost of one call in millionths of a dollar. */
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
