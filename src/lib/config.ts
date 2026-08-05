/**
 * Every number that decides what the app does. Read and changed by whoever maintains the course —
 * deliberately not exposed as settings (principle 1).
 */

// pacing — 2,400 words at 12/day is the 200-day estimate; 6 stops a bad week compounding
export const NEW_WORDS_PER_DAY = 12;
export const NEW_WORDS_REDUCED = 6;

/** A FRACTION. newWordBudget compares a percentage and ×100s at the call site — keep both. */
export const PACE_CUT_ACCURACY = 0.8;
/** Floor before the cut may fire: 3 reviews and one slip is 67% and no evidence. */
export const PACE_MIN_REVIEWS = 20;

/** A cap, not a target. Without one, a fortnight away is a 400-card session nobody starts. */
export const REVIEW_CAP = 60;

// recovery — both conditions, or a gap with a small backlog gets treated as a crisis
export const GAP_DAYS = 3;
export const GAP_BACKLOG = 40;
export const GAP_CARDS = 20;

/** Forgotten this often, the drill is not working. FSRS would reschedule it forever. */
export const LEECH_THRESHOLD = 8;

/** Share of a unit's words learned before it reads as mastered. Never gates progression (spec §7). */
export const MASTERY_THRESHOLD = 0.8;

/** Uncapped, a bad fortnight mines 200 gaps and the block becomes a wall. */
export const CLOZE_BACKLOG_CAP = 40;
export const CLOZE_PER_SESSION = 8;

/** Undo window. The last card shows a closing screen for this long rather than stalling every grade. */
export const UNDO_MS = 5000;

export const EXAM_MINUTES = 30;
export const BROWSE_BATCH = 50;
/** Longest text /text accepts — about four A4 pages. */
export const TEXT_MAX_CHARS = 20_000;
/** Silence after the German, before the English, in walk mode. */
export const WALK_THINK_SECONDS = 3;
/** Offline answers held in the browser. Unbounded, this fills the storage quota and every write throws. */
export const OUTBOX_MAX = 500;
