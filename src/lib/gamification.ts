import { get, run, tx } from "./db.ts";
import { MAX_HEARTS, XP_PER_CORRECT, XP_SESSION_BONUS } from "./config.ts";

export type Stats = { xpTotal: number; hearts: number };

/*
 * Hearts gate new-vocab and new-grammar blocks only — never the spaced-
 * repetition review queue. A wrong "Again" on a due card is FSRS doing its
 * job, not a mistake to punish (see schema.sql's user_stats comment).
 */
const HEART_LOSS_KINDS = new Set(["new-vocab", "new-grammar"]);

type Row = { xp_total: number; hearts: number; hearts_date: string };

/**
 * Reads the row, refilling hearts to MAX_HEARTS if `hearts_date` is not
 * today. Creates the row on first read — every account older than this
 * table has none yet, and a migration touching `user` is not worth it for a
 * table `user_stats` already handles with a default row.
 */
function ensure(userId: string): Row {
  run(
    `INSERT INTO user_stats (user_id) VALUES (?)
     ON CONFLICT(user_id) DO NOTHING`,
    userId,
  );
  const row = get<Row>(
    "SELECT xp_total, hearts, hearts_date FROM user_stats WHERE user_id = ?",
    userId,
  )!;
  if (row.hearts_date !== todayStr()) {
    run(
      "UPDATE user_stats SET hearts = ?, hearts_date = ? WHERE user_id = ?",
      MAX_HEARTS,
      todayStr(),
      userId,
    );
    return { ...row, hearts: MAX_HEARTS, hearts_date: todayStr() };
  }
  return row;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Current XP and hearts, with today's refill already applied. */
export function stats(userId: string): Stats {
  const row = ensure(userId);
  return { xpTotal: row.xp_total, hearts: row.hearts };
}

/**
 * Called once per graded attempt, from the two places every answer in the
 * app passes through: lib/errors.ts logAttempt (builder, listening, writing,
 * speaking, quiz, new-vocab, new-grammar) and lib/srs.ts gradeCard, guarded
 * there by `!log?.silent` so introducing a word's first card — already
 * counted once via logAttempt's "new-vocab" — is not counted twice.
 *
 * Returns the XP gained (0 or XP_PER_CORRECT) and the stats afterward, so the
 * caller can hand the client something to animate.
 */
export function recordOutcome(
  userId: string,
  kind: string,
  correct: boolean,
): { xpGained: number; stats: Stats } {
  return tx(() => {
    const before = ensure(userId);
    const xpGained = correct ? XP_PER_CORRECT : 0;
    let hearts = before.hearts;
    if (!correct && HEART_LOSS_KINDS.has(kind)) {
      hearts = Math.max(0, hearts - 1);
    }
    run(
      "UPDATE user_stats SET xp_total = xp_total + ?, hearts = ? WHERE user_id = ?",
      xpGained,
      hearts,
      userId,
    );
    return {
      xpGained,
      stats: { xpTotal: before.xp_total + xpGained, hearts },
    };
  });
}

/** Session-completion bonus, added once per logged session (session-log.ts). */
export function awardSessionBonus(userId: string): Stats {
  return tx(() => {
    ensure(userId);
    run(
      "UPDATE user_stats SET xp_total = xp_total + ? WHERE user_id = ?",
      XP_SESSION_BONUS,
      userId,
    );
    return stats(userId);
  });
}

/** Whether new material (new-vocab, new-grammar) may still be served today. */
export function hasHearts(userId: string): boolean {
  return ensure(userId).hearts > 0;
}
