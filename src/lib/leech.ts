import { createEmptyCard } from "ts-fsrs";
import { all, get, run } from "./db";
import { toSqlDate } from "./srs";
import { addCloze } from "./cloze";
import { blankWord } from "./cloze-text";

/** Leeches — the words that are eating your time. */

export const LEECH_THRESHOLD = 8;

export type Leech = {
  cardId: number;
  wordId: string;
  lemma: string;
  article: string | null;
  plural: string | null;
  pos: string;
  en: string;
  example_de: string | null;
  example_en: string | null;
  mnemonic: string | null;
  audio_url: string | null;
  lapses: number;
  reps: number;
  suspended: number;
  /** Review attempts on this word, and how many were right. Counted, not scored. */
  seen: number;
  correct_n: number;
};

const SELECT = `
  SELECT c.id AS cardId, w.id AS wordId, w.lemma, w.article, w.plural, w.pos,
         w.en, w.example_de, w.example_en, w.mnemonic, w.audio_url,
         c.lapses, c.reps, c.suspended,
         (SELECT COUNT(*) FROM attempt a
            WHERE a.user_id = c.user_id AND a.kind = 'review' AND a.ref_id = w.id) AS seen,
         (SELECT COALESCE(SUM(a.correct), 0) FROM attempt a
            WHERE a.user_id = c.user_id AND a.kind = 'review' AND a.ref_id = w.id) AS correct_n
    FROM card c JOIN word w ON w.id = c.ref_id
   WHERE c.user_id = ? AND c.ref_type = 'word' AND c.lapses >= ?`;

export function leeches(
  userId: string,
  min = LEECH_THRESHOLD,
  limit = 40,
): Leech[] {
  return all<Leech>(
    `${SELECT} ORDER BY c.suspended ASC, c.lapses DESC, w.freq_rank ASC LIMIT ?`,
    userId,
    min,
    limit,
  );
}

/** Active leeches only — the number worth putting on a screen. */
export function leechCount(userId: string, min = LEECH_THRESHOLD): number {
  return (
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM card
        WHERE user_id = ? AND ref_type = 'word' AND suspended = 0 AND lapses >= ?`,
      userId,
      min,
    )?.n ?? 0
  );
}

function ownedCard(userId: string, cardId: number) {
  return get<{ id: number; ref_id: string }>(
    "SELECT id, ref_id FROM card WHERE id = ? AND user_id = ? AND ref_type = 'word'",
    cardId,
    userId,
  );
}

/** The word behind one of this learner's leech cards, for the mnemonic pass. */
export function leechWord(userId: string, cardId: number) {
  return get<{
    id: string;
    lemma: string;
    article: string | null;
    pos: string;
    en: string;
    mnemonic: string | null;
  }>(
    `SELECT w.id, w.lemma, w.article, w.pos, w.en, w.mnemonic
       FROM card c JOIN word w ON w.id = c.ref_id
      WHERE c.id = ? AND c.user_id = ? AND c.ref_type = 'word'`,
    cardId,
    userId,
  );
}

/** Store a hook on the shared word row. Both flatmates get it. */
export function storeMnemonic(wordId: string, text: string) {
  run("UPDATE word SET mnemonic = ? WHERE id = ?", text, wordId);
}

/** Forget the card. Lapses are deliberately KEPT. */
export function resetLeech(userId: string, cardId: number): boolean {
  if (!ownedCard(userId, cardId)) return false;
  const empty = createEmptyCard(new Date());
  run(
    `UPDATE card
        SET due = ?, stability = 0, difficulty = 0, elapsed_days = 0,
            scheduled_days = 0, reps = 0, state = 0, last_review = NULL,
            suspended = 0
      WHERE id = ? AND user_id = ?`,
    toSqlDate(empty.due),
    cardId,
    userId,
  );
  return true;
}

export function suspendLeech(
  userId: string,
  cardId: number,
  on: boolean,
): boolean {
  if (!ownedCard(userId, cardId)) return false;
  run(
    "UPDATE card SET suspended = ? WHERE id = ? AND user_id = ?",
    on ? 1 : 0,
    cardId,
    userId,
  );
  return true;
}

/** Drill the word in context instead of alone. */
export function clozeLeech(userId: string, cardId: number): boolean {
  const card = ownedCard(userId, cardId);
  if (!card) return false;

  const w = get<{
    lemma: string;
    example_de: string | null;
    example_en: string | null;
  }>(
    "SELECT lemma, example_de, example_en FROM word WHERE id = ?",
    card.ref_id,
  );
  if (!w?.example_de) return false;

  const gap = blankWord(w.example_de, w.lemma);
  if (!gap) return false;

  return addCloze({
    userId,
    full: w.example_de,
    sentence: gap.sentence,
    answer: gap.answer,
    en: w.example_en,
    source: "manual",
    sourceRef: card.ref_id,
  });
}
