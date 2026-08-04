import { all } from "./db";

/**
 * Unit mastery (spec §7) — and why it is not a gate.
 *
 * The spec said a unit is complete at "≥80% of its words learned AND its
 * grammar ≥70". That was never built, and building it literally would break
 * the course: `currentUnit()` returns the first unit that is not complete, so
 * a retention threshold on completion means the learner sits on unit 1 for the
 * fortnight it takes FSRS intervals to reach `state = 2` — no new vocabulary,
 * no new grammar, nothing to do but reviews. That is the exact shape of the
 * week people quit in.
 *
 * So the two ideas are separated rather than merged:
 *
 *   COMPLETE   every word has been introduced. Coverage. Drives progression,
 *              because the thing that must never stall is showing up.
 *   MASTERED   ≥80% of those words are actually learned, and the unit's
 *              grammar point is solid. Retention. Drives what the app *says*
 *              about you — never what it lets you do.
 *
 * Retention is already handled where it belongs: the forgetting curve brings
 * words back whether or not the unit is behind you, and `newWordBudget()` cuts
 * the daily intake from twelve to six when the week is going badly. Neither of
 * those stops you.
 *
 * Deliberately computed, never stored. Mastery goes DOWN — one lapse drops a
 * card out of `state = 2` — and a stored status would quietly become a claim
 * about the past that reads as a claim about the present. Principle 4.
 */

/** Spec §7: the share of a unit's words that must be learned. */
export const MASTERY_THRESHOLD = 0.8;

/** Same definition of "learned" the rest of the app uses, for words and rules. */
const LEARNED = "reps >= 3 AND state = 2";

export type Mastery = {
  unitId: string;
  /** Words in the unit that are learned, not merely met. */
  learned: number;
  total: number;
  /** 0–100, rounded. */
  pct: number;
  /** null when the unit teaches no grammar point. */
  grammarSolid: boolean | null;
  mastered: boolean;
};

/**
 * Mastery for every unit, in one query.
 *
 * Der Weg draws all 120 at once; a per-unit function called in a loop would be
 * 120 round trips to render one page. `json_each` unpacks `word_ids_json`
 * inside SQLite so the word lists never cross into JavaScript.
 */
export function masteryByUnit(userId: string): Map<string, Mastery> {
  const rows = all<{
    id: string;
    grammar_id: string | null;
    total: number;
    learned: number;
    grammar_solid: number | null;
  }>(
    `SELECT u.id,
            u.grammar_id,
            (SELECT COUNT(*) FROM json_each(u.word_ids_json)) AS total,
            (SELECT COUNT(*) FROM json_each(u.word_ids_json) je
               JOIN card c ON c.ref_id = je.value
                          AND c.ref_type = 'word' AND c.user_id = ?1
              WHERE c.${LEARNED}) AS learned,
            CASE WHEN u.grammar_id IS NULL THEN NULL ELSE (
              SELECT COUNT(*) FROM card g
               WHERE g.user_id = ?1 AND g.ref_type = 'grammar'
                 AND g.ref_id = u.grammar_id AND g.${LEARNED}
            ) END AS grammar_solid
       FROM unit u`,
    userId,
  );

  return new Map(
    rows.map((r) => {
      const pct = r.total ? Math.round((r.learned / r.total) * 100) : 0;
      const grammarSolid = r.grammar_id === null ? null : (r.grammar_solid ?? 0) > 0;
      return [
        r.id,
        {
          unitId: r.id,
          learned: r.learned,
          total: r.total,
          pct,
          grammarSolid,
          // A unit with no grammar point is judged on its words alone, rather
          // than being unmasterable because it has nothing to be solid about.
          mastered:
            r.total > 0 &&
            r.learned / r.total >= MASTERY_THRESHOLD &&
            grammarSolid !== false,
        },
      ] as const;
    }),
  );
}

/** One unit. Convenience over the batch — same numbers, same definition. */
export function unitMastery(userId: string, unitId: string): Mastery | null {
  return masteryByUnit(userId).get(unitId) ?? null;
}
