import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  State,
  type Card as FsrsCard,
  type Grade,
} from "ts-fsrs";
import { all, get, run, tx } from "./db";
import { classify } from "./errors";

/**
 * FSRS scheduling. Never hand-roll intervals (spec §6) — ts-fsrs is the
 * reference implementation and it is one npm package with no native deps.
 */
const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

/** SQLite has no date type — dates are strings, compared as strings. */
export function toSqlDate(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

const GRADES = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const;

export type DbCard = {
  id: number;
  user_id: string;
  ref_type: string;
  ref_id: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
};

function toFsrs(r: DbCard): FsrsCard {
  return {
    due: new Date(r.due),
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsed_days,
    scheduled_days: r.scheduled_days,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state as State,
    learning_steps: 0,
    last_review: r.last_review ? new Date(r.last_review) : undefined,
  };
}

/** Put a word into the deck at the moment it is introduced, with a real rep. */
export function introduceWord(
  userId: string,
  wordId: string,
  correct: boolean,
) {
  // Insert, read back and grade as one unit.
  return tx(() => {
    const empty = createEmptyCard(new Date());
    run(
      `INSERT INTO card (user_id, ref_type, ref_id, due, stability, difficulty,
         elapsed_days, scheduled_days, reps, lapses, state)
       VALUES (?, 'word', ?, ?, 0, 0, 0, 0, 0, 0, 0)
       ON CONFLICT(user_id, ref_type, ref_id) DO NOTHING`,
      userId,
      wordId,
      toSqlDate(empty.due),
    );

    const card = get<DbCard>(
      "SELECT * FROM card WHERE user_id = ? AND ref_type = 'word' AND ref_id = ?",
      userId,
      wordId,
    );
    // Already in rotation — a re-introduction must not reset a real history.
    if (!card || card.reps > 0) return null;

    // The recognition check at the end of the introduction IS the first rep.
    return gradeCard(userId, card.id, correct ? Rating.Good : Rating.Again);
  });
}

export type DueCard = {
  cardId: number;
  wordId: string;
  lemma: string;
  article: string | null;
  plural: string | null;
  pos: string;
  en: string;
  audio_url: string | null;
  forms_json: string | null;
  state: number;
  reps: number;
  /** What each grade would schedule. Keyed by Rating (1–4). */
  intervals: Record<number, string>;
};

/** Due cards, capped at `limit`. */
export function dueCards(userId: string, limit = 60): DueCard[] {
  // Pull the FSRS state alongside the word so each card can be projected
  // server-side — the client never needs to know how scheduling works.
  const rows = all<Omit<DueCard, "intervals"> & FsrsFields>(
    `SELECT c.id AS cardId, w.id AS wordId, w.lemma, w.article, w.plural,
            w.pos, w.en, w.audio_url, w.forms_json,
            c.state, c.reps, c.due, c.stability, c.difficulty,
            c.elapsed_days, c.scheduled_days, c.lapses, c.last_review
       FROM card c JOIN word w ON w.id = c.ref_id
      WHERE c.user_id = ? AND c.ref_type = 'word' AND c.suspended = 0
        AND datetime(c.due) <= datetime('now')
      ORDER BY (julianday('now') - julianday(c.due))
               / (CASE WHEN c.scheduled_days < 1 THEN 1 ELSE c.scheduled_days END) DESC,
               w.freq_rank ASC
      LIMIT ?`,
    userId,
    limit,
  );

  return rows.map((r) => ({
    cardId: r.cardId,
    wordId: r.wordId,
    lemma: r.lemma,
    article: r.article,
    plural: r.plural,
    pos: r.pos,
    en: r.en,
    audio_url: r.audio_url,
    forms_json: r.forms_json,
    state: r.state,
    reps: r.reps,
    intervals: previewIntervals(r),
  }));
}

export function dueCount(userId: string): number {
  return (
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM card
        WHERE user_id = ? AND ref_type = 'word' AND suspended = 0
          AND datetime(due) <= datetime('now')`,
      userId,
    )?.n ?? 0
  );
}

/** Apply a grade, persist the new schedule, and log the attempt. */
export function gradeCard(
  userId: string,
  cardId: number,
  grade: Grade,
  log?: { answer?: string; expected?: string },
) {
  /* The read is INSIDE the transaction, and it was not. */
  return tx(() => {
    const row = get<DbCard>(
      "SELECT * FROM card WHERE id = ? AND user_id = ?",
      cardId,
      userId,
    );
    if (!row) throw new Error(`card ${cardId} not found for user ${userId}`);

    const now = new Date();
    const { card } = scheduler.next(toFsrs(row), now, grade);

    run(
      `UPDATE card SET due=?, stability=?, difficulty=?, elapsed_days=?,
         scheduled_days=?, reps=?, lapses=?, state=?, last_review=?
       WHERE id=? AND user_id=?`,
      toSqlDate(card.due),
      card.stability,
      card.difficulty,
      card.elapsed_days,
      card.scheduled_days,
      card.reps,
      card.lapses,
      card.state,
      toSqlDate(now),
      cardId,
      /* Scoped, though the SELECT above already proved ownership. */
      userId,
    );
    // Cloze grades are logged under their own kind. Folding them into 'review'
    // would inflate the review count on the recap and in the accuracy table
    // with a different exercise — two skills, two rows.
    const correct = grade === Rating.Again ? 0 : 1;
    const tags =
      !correct && log?.expected && log?.answer
        ? classify(log.expected, log.answer)
        : [];
    run(
      `INSERT INTO attempt (user_id, kind, ref_id, correct, user_answer, expected, error_tags_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      userId,
      row.ref_type === "cloze" ? "cloze" : "review",
      row.ref_id,
      correct,
      log?.answer ?? String(grade),
      log?.expected ?? null,
      JSON.stringify(tags),
    );

    return {
      due: card.due.toISOString(),
      scheduled_days: card.scheduled_days,
      stability: card.stability,
      state: card.state,
    };
  });
}

/** What each button would cost, computed before you answer. */
export function previewIntervals(row: FsrsFields): Record<number, string> {
  const now = new Date();
  const base = toFsrs(row as DbCard);
  const out: Record<number, string> = {};
  for (const grade of GRADES) {
    const { card } = scheduler.next(base, now, grade);
    const mins = Math.round((card.due.getTime() - now.getTime()) / 60000);
    out[grade] =
      mins < 60
        ? `${Math.max(1, mins)} min`
        : mins < 1440
          ? `${Math.round(mins / 60)} h`
          : mins < 30 * 1440
            ? `${Math.round(mins / 1440)} d`
            : `${Math.round(mins / (30 * 1440))} Mon`;
  }
  return out;
}

/** The subset of card state FSRS needs to project an interval. */
export type FsrsFields = Pick<
  DbCard,
  | "due"
  | "stability"
  | "difficulty"
  | "elapsed_days"
  | "scheduled_days"
  | "reps"
  | "lapses"
  | "state"
  | "last_review"
>;

export { Rating, State };
