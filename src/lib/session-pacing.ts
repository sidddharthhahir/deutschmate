import { get } from "./db";
import {
  NEW_WORDS_PER_DAY,
  NEW_WORDS_REDUCED,
  PACE_CUT_ACCURACY,
  PACE_MIN_REVIEWS,
} from "@/lib/config";

/**
 * How many new words to introduce today. Returns the reason too, because the app must be able to
 * say WHY it slowed down rather than quietly giving you less.
 */
export function newWordBudget(userId: string) {
  const row = get<{ n: number; correct: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(correct),0) AS correct
       FROM attempt
      WHERE user_id = ? AND kind = 'review'
        AND created_at > datetime('now','-7 days')`,
    userId,
  );

  const n = row?.n ?? 0;
  if (n < PACE_MIN_REVIEWS) {
    return {
      words: NEW_WORDS_PER_DAY,
      accuracy: null as number | null,
      reduced: false,
    };
  }

  /*
   * `accuracy` is a percentage because that is what the recap prints; the config threshold is a
   * fraction because every other ratio in that file is.
   */
  const accuracy = Math.round(((row?.correct ?? 0) / n) * 100);
  const reduced = accuracy < PACE_CUT_ACCURACY * 100;
  return {
    words: reduced ? NEW_WORDS_REDUCED : NEW_WORDS_PER_DAY,
    accuracy,
    reduced,
  };
}
