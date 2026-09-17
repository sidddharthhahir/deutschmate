import { get, run, tx } from "./db";

/** Record a finished session and return the streak it leaves behind. */
export function logSession(userId: string, minutes: number, blocks: string[]) {
  return tx(() => {
    const yesterday = get<{ streak_day: number }>(
      `SELECT streak_day FROM session_log
        WHERE user_id = ? AND date = date('now','-1 day')`,
      userId,
    );
    run(
      `INSERT INTO session_log (user_id, date, minutes, blocks_json, streak_day)
       VALUES (?, date('now'), ?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE
         SET minutes = minutes + excluded.minutes,
             blocks_json = excluded.blocks_json`,
      userId,
      minutes,
      JSON.stringify(blocks),
      (yesterday?.streak_day ?? 0) + 1,
    );
    return (
      get<{ streak_day: number }>(
        "SELECT streak_day FROM session_log WHERE user_id = ? AND date = date('now')",
        userId,
      )?.streak_day ?? 1
    );
  });
}

/**
 * The streak, if it is still alive. Zero once it has been broken.
 *
 * A streak is alive when the last session was today or yesterday: not having
 * studied yet TODAY has not broken anything, but a whole missed day has.
 *
 * This used to read the last streak_day whatever its date, so a learner who
 * stopped six days ago was still told "Tag 12" on the home screen, on
 * /fortschritt and on the recap. logSession had the rule right all along —
 * it resets to 1 when yesterday has no row — and only the reading of it lied.
 * "Never fake progress" is the fourth principle of this app, and a streak
 * counter that keeps counting while you do nothing is exactly that.
 */
export function currentStreak(userId: string): number {
  return (
    get<{ n: number }>(
      `SELECT streak_day AS n FROM session_log
        WHERE user_id = ? AND date >= date('now','-1 day')
        ORDER BY date DESC LIMIT 1`,
      userId,
    )?.n ?? 0
  );
}
