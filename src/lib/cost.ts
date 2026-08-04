import { all, get, run } from "./db";
import { priceOf as price, ceiling as budgetCeiling, type Usage as U } from "./pricing";

/**
 * What the AI actually costs.
 *
 * The budget for this app was a hard €10/month, and until now there was no way
 * to check it. The irony was that every response already carried exact token
 * counts — input, output, cache reads, cache writes — and every caller threw
 * them away. This records them and prices them.
 *
 * The numbers here are the API's own counts, not an estimate of them. The only
 * estimated part is the money, because prices change and promotional rates
 * exist; standard published rates are used, so the figure errs high rather
 * than reassuring you with a number that turns out to be optimistic.
 */

export { priceOf, PRICES, ceiling, type Usage } from "./pricing";

/**
 * Record a call. Never throws — a failed bookkeeping write must not take down
 * the feature it was measuring.
 */
export function recordUsage(userId: string, kind: string, model: string, u: U) {
  try {
    run(
      `INSERT INTO usage (user_id, kind, model, input, output, cache_read, cache_write, micros)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      kind,
      model,
      u.input_tokens ?? 0,
      u.output_tokens ?? 0,
      u.cache_read_input_tokens ?? 0,
      u.cache_creation_input_tokens ?? 0,
      price(model, u),
    );
  } catch {
    /* bookkeeping is never worth an error page */
  }
}

export type Spend = {
  calls: number;
  micros: number;
  dollars: number;
  input: number;
  output: number;
  cacheRead: number;
  /** Share of input tokens served from cache — the thing keeping this cheap. */
  cacheShare: number;
  byKind: { kind: string; calls: number; micros: number }[];
};

function totals(userId: string, since: string): Spend {
  const row = get<{
    calls: number;
    micros: number;
    input: number;
    output: number;
    cache_read: number;
  }>(
    `SELECT COUNT(*) AS calls, COALESCE(SUM(micros),0) AS micros,
            COALESCE(SUM(input),0) AS input, COALESCE(SUM(output),0) AS output,
            COALESCE(SUM(cache_read),0) AS cache_read
       FROM usage WHERE user_id = ? AND created_at > datetime('now', ?)`,
    userId,
    since,
  );

  const byKind = all<{ kind: string; calls: number; micros: number }>(
    `SELECT kind, COUNT(*) AS calls, COALESCE(SUM(micros),0) AS micros
       FROM usage WHERE user_id = ? AND created_at > datetime('now', ?)
      GROUP BY kind ORDER BY micros DESC`,
    userId,
    since,
  );

  const input = row?.input ?? 0;
  const cacheRead = row?.cache_read ?? 0;
  const micros = row?.micros ?? 0;

  return {
    calls: row?.calls ?? 0,
    micros,
    dollars: micros / 1_000_000,
    input,
    output: row?.output ?? 0,
    cacheRead,
    cacheShare: input + cacheRead ? Math.round((cacheRead / (input + cacheRead)) * 100) : 0,
    byKind,
  };
}

export const spendThisMonth = (userId: string) => totals(userId, "-30 days");

/**
 * How much of the ceiling is left.
 *
 * Per user, so one flatmate cannot spend the other out of a conversation. Two
 * users at the default therefore share a $10 bill, which is the number this app
 * was specified against.
 */
export function budgetLeft(userId: string) {
  const spent = spendThisMonth(userId).dollars;
  const c = budgetCeiling();
  return { spent, ceiling: c, remaining: Math.max(0, c - spent) };
}

/**
 * Projected monthly spend from the last 30 days.
 *
 * Straight arithmetic on what has actually been spent, scaled by how long the
 * data covers. Returns null until there is a week of history — a projection
 * from two days would swing wildly and mean nothing.
 */
export function projectedMonthly(userId: string): number | null {
  const first = get<{ d: number | null }>(
    `SELECT CAST(julianday('now') - julianday(MIN(created_at)) AS REAL) AS d
       FROM usage WHERE user_id = ?`,
    userId,
  )?.d;
  if (!first || first < 7) return null;

  const days = Math.min(first, 30);
  const window = totals(userId, `-${Math.ceil(days)} days`);
  return (window.dollars / days) * 30;
}

