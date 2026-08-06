import { createEmptyCard } from "ts-fsrs";
import { all, get, run, tx } from "./db";
import { toSqlDate } from "./srs";
import { blankForError } from "./cloze-text";
import { needsUnit } from "./sentence-grammar";
import { CLOZE_BACKLOG_CAP as BACKLOG_CAP } from "@/lib/config";

/** Cloze cards — fill the gap. A cloze is only worth making when ONE token is wrong. */

export type Cloze = {
  id: number;
  sentence: string;
  answer: string;
  full: string;
  en: string | null;
  source: string;
  tag: string | null;
};

/** Cap on how many unanswered cloze cards may pile up. */

// ---------------------------------------------------------------- persistence

export function clozeBacklog(userId: string): number {
  return (
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM cloze cl
         LEFT JOIN card c
           ON c.user_id = cl.user_id AND c.ref_type = 'cloze' AND c.ref_id = CAST(cl.id AS TEXT)
        WHERE cl.user_id = ? AND COALESCE(c.reps, 0) = 0`,
      userId,
    )?.n ?? 0
  );
}

/** Store a cloze and give it an FSRS card. */
export function addCloze(opts: {
  userId: string;
  full: string;
  sentence: string;
  answer: string;
  en?: string | null;
  source: "error" | "reading" | "manual";
  sourceRef?: string | null;
  tag?: string | null;
}): boolean {
  return tx(() => {
    const res = run(
      `INSERT INTO cloze (user_id, sentence, answer, full, en, source, source_ref, tag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, sentence, answer) DO NOTHING`,
      opts.userId,
      opts.sentence,
      opts.answer,
      opts.full,
      opts.en ?? null,
      opts.source,
      opts.sourceRef ?? null,
      opts.tag ?? null,
    );
    if (!res.changes) return false;

    run(
      `INSERT INTO card (user_id, ref_type, ref_id, due, state)
       VALUES (?, 'cloze', ?, ?, 0)
       ON CONFLICT(user_id, ref_type, ref_id) DO NOTHING`,
      opts.userId,
      String(res.lastInsertRowid),
      toSqlDate(createEmptyCard(new Date()).due),
    );
    return true;
  });
}

/**
 * Turn recent mistakes into cloze cards.
 *
 * `reach` is how far into A1 the learner has got. Attempts at sentences beyond
 * it are skipped: those are the ones the old word-frequency filing served too
 * early, and drilling a learner on grammar nobody has taught them is punishing
 * them for a bug. 99 mines everything, which is what past-A1 learners want.
 */
export function mineFromErrors(userId: string, reach = 99, days = 14): number {
  if (clozeBacklog(userId) >= BACKLOG_CAP) return 0;

  const rows = all<{
    id: number;
    expected: string;
    user_answer: string;
    tags: string;
  }>(
    `SELECT id, expected, user_answer, error_tags_json AS tags
       FROM attempt
      WHERE user_id = ? AND correct = 0
        AND expected IS NOT NULL AND user_answer IS NOT NULL
        AND kind IN ('builder','writing','listening','reading','quiz')
        AND created_at > datetime('now', ?)
      ORDER BY id DESC
      LIMIT 200`,
    userId,
    `-${days} days`,
  );

  let made = 0;
  for (const r of rows) {
    if (clozeBacklog(userId) + made >= BACKLOG_CAP) break;
    if (needsUnit(r.expected) > reach) continue;
    const gap = blankForError(r.expected, r.user_answer);
    if (!gap) continue;
    const tags = safeTags(r.tags);
    if (
      addCloze({
        userId,
        full: r.expected,
        sentence: gap.sentence,
        answer: gap.answer,
        source: "error",
        sourceRef: String(r.id),
        tag: tags[0] ?? null,
      })
    ) {
      made++;
    }
  }
  return made;
}

function safeTags(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

export type DueCloze = Cloze & { cardId: number };

export function dueCloze(userId: string, limit = 8): DueCloze[] {
  return all<DueCloze>(
    `SELECT c.id AS cardId, cl.id, cl.sentence, cl.answer, cl.full, cl.en,
            cl.source, cl.tag
       FROM card c
       JOIN cloze cl ON CAST(cl.id AS TEXT) = c.ref_id AND cl.user_id = c.user_id
      WHERE c.user_id = ? AND c.ref_type = 'cloze' AND c.suspended = 0
        AND datetime(c.due) <= datetime('now')
      ORDER BY c.due
      LIMIT ?`,
    userId,
    limit,
  );
}

export function clozeDueCount(userId: string): number {
  return (
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM card
        WHERE user_id = ? AND ref_type = 'cloze' AND suspended = 0
          AND datetime(due) <= datetime('now')`,
      userId,
    )?.n ?? 0
  );
}

/**
 * Throw a gap away. Mining is automatic, so some of what it produces is junk — a typo you will
 * never repeat, a proper noun, a sentence that made sense only in the moment.
 */
export function deleteCloze(userId: string, clozeId: number): boolean {
  return tx(() => {
    const res = run(
      "DELETE FROM cloze WHERE id = ? AND user_id = ?",
      clozeId,
      userId,
    );
    if (!res.changes) return false;
    run(
      "DELETE FROM card WHERE user_id = ? AND ref_type = 'cloze' AND ref_id = ?",
      userId,
      String(clozeId),
    );
    return true;
  });
}

export function clozeTotal(userId: string): number {
  return (
    get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM cloze WHERE user_id = ?",
      userId,
    )?.n ?? 0
  );
}
