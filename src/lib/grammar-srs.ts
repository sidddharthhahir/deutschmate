import { createEmptyCard } from "ts-fsrs";
import { all, get, run } from "./db";
import { gradeCard, toSqlDate, Rating } from "./srs";

/**
 * Grammar on the same forgetting curve as vocabulary.
 *
 * Until now only words were spaced-repeated. You met Perfekt once, in one unit,
 * and the app never asked you about it again — so the thing the B1 exam
 * actually tests was the one thing never reviewed. The `card` table always
 * supported ref_type='grammar'; nothing ever wrote one.
 *
 * A grammar card is not a flashcard. Its "front" is a drill drawn from the
 * point's own drills_json, and a different drill each time it comes up — so
 * what gets reinforced is the rule, not the memory of one question.
 */

export type GrammarCard = {
  cardId: number;
  grammarId: string;
  slug: string;
  title: string;
  level: string;
  drills: Drill[];
  reps: number;
  lapses: number;
};

export type Drill = { q: string; options: string[]; a: number; why: string };

function parseDrills(json: string): Drill[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as Drill[]) : [];
  } catch {
    return [];
  }
}

/**
 * Put a grammar point into the deck when it is taught.
 *
 * Mirrors introduceWord: the drills at the end of the lesson are the first rep,
 * so the point is scheduled from real performance rather than from the date it
 * happened to appear in a unit.
 */
export function introduceGrammar(userId: string, grammarId: string, correct: boolean) {
  run(
    `INSERT INTO card (user_id, ref_type, ref_id, due, state)
     VALUES (?, 'grammar', ?, ?, 0)
     ON CONFLICT(user_id, ref_type, ref_id) DO NOTHING`,
    userId,
    grammarId,
    toSqlDate(createEmptyCard(new Date()).due),
  );

  const card = get<{ id: number; reps: number }>(
    "SELECT id, reps FROM card WHERE user_id = ? AND ref_type = 'grammar' AND ref_id = ?",
    userId,
    grammarId,
  );
  // A lesson fires this once per drill. Only the first one is the first rep;
  // the rest must not re-grade, and a point already in rotation keeps its
  // history. Without this the card would sit at reps=0, permanently due, and
  // come back for review in the same session it was taught.
  if (!card || card.reps > 0) return null;

  return gradeCard(userId, card.id, correct ? Rating.Good : Rating.Again);
}

/** Grammar points due for review right now. */
export function dueGrammar(userId: string, limit = 3): GrammarCard[] {
  const rows = all<{
    cardId: number;
    grammarId: string;
    slug: string;
    title: string;
    level: string;
    drills_json: string;
    reps: number;
    lapses: number;
  }>(
    `SELECT c.id AS cardId, g.id AS grammarId, g.slug, g.title, g.level,
            g.drills_json, c.reps, c.lapses
       FROM card c JOIN grammar g ON g.id = c.ref_id
      WHERE c.user_id = ? AND c.ref_type = 'grammar' AND c.suspended = 0
        AND datetime(c.due) <= datetime('now')
      ORDER BY c.due
      LIMIT ?`,
    userId,
    limit,
  );

  return rows
    .map((r) => ({
      cardId: r.cardId,
      grammarId: r.grammarId,
      slug: r.slug,
      title: r.title,
      level: r.level,
      reps: r.reps,
      lapses: r.lapses,
      // Rotate through the drills by rep count, so a point coming back for the
      // fourth time asks a different question than it did the first time.
      drills: rotate(parseDrills(r.drills_json), r.reps),
    }))
    .filter((g) => g.drills.length > 0);
}

/** Start the list at `by`, wrapping — same items, different first question. */
function rotate<T>(xs: T[], by: number): T[] {
  if (xs.length < 2) return xs;
  const n = ((by % xs.length) + xs.length) % xs.length;
  return [...xs.slice(n), ...xs.slice(0, n)];
}

export function grammarDueCount(userId: string): number {
  return (
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM card
        WHERE user_id = ? AND ref_type = 'grammar' AND suspended = 0
          AND datetime(due) <= datetime('now')`,
      userId,
    )?.n ?? 0
  );
}

/** How many grammar points are in the deck at all, for Fortschritt. */
export function grammarStats(userId: string) {
  const total = get<{ n: number }>("SELECT COUNT(*) AS n FROM grammar")?.n ?? 0;
  const inDeck =
    get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM card WHERE user_id = ? AND ref_type = 'grammar'",
      userId,
    )?.n ?? 0;
  const solid =
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM card
        WHERE user_id = ? AND ref_type = 'grammar' AND reps >= 3 AND state = 2`,
      userId,
    )?.n ?? 0;
  return { total, inDeck, solid };
}
