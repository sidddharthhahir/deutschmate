import { all, get, run } from "./db";
import { LEVELS } from "./levels";
import type { Unit, Word } from "./session-types";

export { LEVELS };

export function unitsFor(level: string) {
  return all<Unit>("SELECT * FROM unit WHERE level = ? ORDER BY ord", level);
}

/** Words in a unit that the user has never been shown. */
export function unseenWords(userId: string, wordIds: string[]): Word[] {
  if (!wordIds.length) return [];
  const ph = wordIds.map(() => "?").join(",");
  return all<Word>(
    `SELECT w.* FROM word w
       LEFT JOIN card c ON c.ref_id = w.id AND c.ref_type='word' AND c.user_id = ?
      WHERE w.id IN (${ph}) AND (c.id IS NULL OR c.reps = 0)
      ORDER BY w.freq_rank`,
    userId,
    ...wordIds,
  );
}

export function wordsIn(ids: string[]): Word[] {
  if (!ids.length) return [];
  const ph = ids.map(() => "?").join(",");
  return all<Word>(
    `SELECT * FROM word WHERE id IN (${ph}) ORDER BY freq_rank`,
    ...ids,
  );
}

/** Every unit this learner has finished. One query, for the walk below. */
function completedUnits(userId: string): Set<string> {
  return new Set(
    all<{ unit_id: string }>(
      "SELECT unit_id FROM unit_progress WHERE user_id = ? AND status = 'complete'",
      userId,
    ).map((r) => r.unit_id),
  );
}

/**
 * Spec §7: a unit is available once its prerequisites are complete. A typo in the content files
 * must not be able to strand a learner on a unit they can never unlock.
 */
function prereqsMet(
  unit: Unit,
  done: Set<string>,
  known: Set<string>,
): boolean {
  let ids: unknown;
  try {
    ids = JSON.parse(unit.prereq_json);
  } catch {
    return true; // malformed content is not the learner's problem
  }
  if (!Array.isArray(ids)) return true;
  return ids.every(
    (id) => typeof id !== "string" || !known.has(id) || done.has(id),
  );
}

/**
 * The current unit — searched across the WHOLE course, not just one level. This used to look only
 * inside `level`, and nothing anywhere ever changed `user.level` from its default.
 */
export function currentUnit(userId: string, level: string): Unit | null {
  const start = Math.max(0, LEVELS.indexOf(level as (typeof LEVELS)[number]));
  const done = completedUnits(userId);
  const known = new Set(
    all<{ id: string }>("SELECT id FROM unit").map((r) => r.id),
  );

  /*
   * Two passes. That is a far worse failure than ignoring a prerequisite: bad content data must
   * never be able to end someone's course.
   */
  for (const respectPrereqs of [true, false]) {
    for (let i = start; i < LEVELS.length; i++) {
      const lv = LEVELS[i];
      for (const u of unitsFor(lv)) {
        if (done.has(u.id)) continue;
        if (respectPrereqs && !prereqsMet(u, done, known)) continue;
        if (lv !== level)
          run("UPDATE user SET level = ? WHERE id = ?", lv, userId);
        return u;
      }
    }
  }

  // Every unit of every level really is done. Stay on the last one rather than
  // inventing a level beyond B1.2.
  const last = unitsFor(LEVELS[LEVELS.length - 1]);
  return last[last.length - 1] ?? null;
}

/** Where your current pace lands you. */
export function paceProjection(userId: string) {
  const row = get<{ done: number; first: string | null }>(
    `SELECT COUNT(*) AS done, MIN(completed_at) AS first
       FROM unit_progress WHERE user_id = ? AND status = 'complete'`,
    userId,
  );
  const done = row?.done ?? 0;
  const total = get<{ n: number }>("SELECT COUNT(*) AS n FROM unit")?.n ?? 0;
  if (!row?.first || done < 3 || done >= total) return null;

  const days = Math.max(
    1,
    Math.round(
      (Date.now() - new Date(row.first.replace(" ", "T") + "Z").getTime()) /
        86_400_000,
    ),
  );
  const perWeek = (done / days) * 7;
  if (perWeek <= 0) return null;

  const remaining = total - done;
  const weeksLeft = remaining / perWeek;
  const finish = new Date(Date.now() + weeksLeft * 7 * 86_400_000);

  return {
    done,
    total,
    remaining,
    days,
    perWeek: Math.round(perWeek * 10) / 10,
    weeksLeft: Math.round(weeksLeft),
    finish: finish.toISOString().slice(0, 10),
  };
}

/** How many units this level has — for "Unit 3 von 20" without hardcoding 20. */
export function unitCount(level: string): number {
  return (
    get<{ n: number }>("SELECT COUNT(*) AS n FROM unit WHERE level = ?", level)
      ?.n ?? 0
  );
}

/** Words in this unit the learner has still never been shown. */
export function unseenInUnit(userId: string, unitId: string): number {
  const unit = get<{ word_ids_json: string }>(
    "SELECT word_ids_json FROM unit WHERE id = ?",
    unitId,
  );
  if (!unit) return 0;
  const ids: string[] = JSON.parse(unit.word_ids_json);
  return unseenWords(userId, ids).length;
}

/**
 * Units the learner finished at least a week ago. Words and grammar rules come back on a
 * forgetting curve; situations never did.
 */
export function pastUnits(userId: string): Unit[] {
  return all<Unit>(
    `SELECT u.* FROM unit_progress p JOIN unit u ON u.id = p.unit_id
      WHERE p.user_id = ? AND p.status = 'complete'
        AND p.completed_at < datetime('now', '-7 days')
      ORDER BY p.completed_at`,
    userId,
  );
}

/**
 * Pick one past unit, rotating by day. Deterministic rather than random, for the same reason the
 * rest of the session is: reloading the page must not hand you a different revision.
 */
export function rotate<T>(items: T[], dayIndex: number): T | undefined {
  return items.length ? items[dayIndex % items.length] : undefined;
}

export function markUnitComplete(userId: string, unitId: string) {
  run(
    `INSERT INTO unit_progress (user_id, unit_id, status, completed_at)
     VALUES (?, ?, 'complete', datetime('now'))
     ON CONFLICT(user_id, unit_id) DO UPDATE
       SET status='complete', completed_at=datetime('now')`,
    userId,
    unitId,
  );
}

/** Every word the learner has met — the whitelist for the AI (spec §8). */
export function knownVocabulary(userId: string): string[] {
  return all<{ lemma: string }>(
    `SELECT w.lemma FROM card c JOIN word w ON w.id = c.ref_id
      WHERE c.user_id = ? AND c.ref_type = 'word' AND c.reps > 0
      ORDER BY w.freq_rank`,
    userId,
  ).map((r) => r.lemma);
}

/**
 * Has the user seen new vocabulary today? Spec §3 — new vocab and new grammar
 * never share a day. g-aussprache (the one-time pronunciation primer) is
 * excluded from the grammar side so answering it doesn't spend the budget
 * unit 1's own new-vocab block needs that same session.
 */
export function introducedToday(userId: string, kind: "vocab" | "grammar") {
  const n =
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM attempt
        WHERE user_id = ? AND kind = ? AND date(created_at) = date('now')
          AND ref_id IS NOT 'g-aussprache'`,
      userId,
      kind === "vocab" ? "new-vocab" : "new-grammar",
    )?.n ?? 0;
  return n > 0;
}

export function daysSinceLastSession(userId: string): number {
  const row = get<{ d: number }>(
    `SELECT CAST(julianday('now') - julianday(MAX(date)) AS INTEGER) AS d
       FROM session_log WHERE user_id = ?`,
    userId,
  );
  return row?.d ?? 0;
}
