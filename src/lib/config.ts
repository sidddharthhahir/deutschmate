/**
 * The numbers that decide what this app does.
 *
 * They were spread across twelve files — REVIEW_CAP in session.ts,
 * LEECH_THRESHOLD in leech.ts, UNDO_MS in a component, BACKLOG_CAP in cloze.ts.
 * Each was named and commented where it sat, which was better than a magic
 * number and still meant nobody could answer "what does this app decide for
 * you" without reading twelve files.
 *
 * DELIBERATELY CODE, NOT SETTINGS.
 *
 * Principle 1 is that the app decides: no lesson picker, no difficulty slider.
 * A "new words per day" control would undo the thing that makes it work, and
 * every knob is a combination somebody has to support and test. These are here
 * to be READ and occasionally changed by whoever maintains the course — not
 * exposed.
 *
 * The three kinds that ARE config live elsewhere, on purpose:
 *   lib/env.ts          deployment — paths, secrets, switches
 *   data/models.json    the provider catalogue — model ids and prices
 *   the `user` table    per learner — their key, their cap  (step 4)
 */

// ------------------------------------------------------------------ pacing
/**
 * New words in a day, and the reduced figure when the week is going badly.
 *
 * Twelve is the number the whole seven-month estimate rests on: 2,400 words at
 * twelve a day is 200 days. Six is not a punishment — it is what stops a bad
 * week compounding into a backlog nobody comes back to.
 */
export const NEW_WORDS_PER_DAY = 12;
export const NEW_WORDS_REDUCED = 6;

/** Below this weekly accuracy, the intake drops to NEW_WORDS_REDUCED. */
export const PACE_CUT_ACCURACY = 0.8;

/**
 * Reviews offered in one session.
 *
 * A cap, not a target. Sixty is roughly twelve minutes; without one, a fortnight
 * away produces a four-hundred-card session that nobody starts, and the backlog
 * becomes permanent.
 */
export const REVIEW_CAP = 60;

// ---------------------------------------------------------------- recovery
/**
 * Wiedereinstieg: days away AND cards waiting before the session collapses to
 * reviews only. Both conditions, because a gap with a small backlog is just a
 * normal day and treating it as a crisis is how an app becomes nagging.
 */
export const GAP_DAYS = 3;
export const GAP_BACKLOG = 40;
/** How many cards that recovery session offers. */
export const GAP_CARDS = 20;

// ------------------------------------------------------------------ leeches
/**
 * Forgetting a word this many times means the drill is not working.
 *
 * Eight is a judgement, and it is the point at which repetition has clearly
 * stopped being the answer — FSRS will happily schedule the same card three
 * hundred more times without mentioning that anything is wrong.
 */
export const LEECH_THRESHOLD = 8;

// ------------------------------------------------------------------ mastery
/**
 * Share of a unit's words that must be LEARNED before it counts as mastered.
 *
 * Never gates progression — see spec §7 for why a retention threshold on
 * completion parks a learner on unit 1 for a fortnight. It decides what the app
 * SAYS about you, never what it lets you do.
 */
export const MASTERY_THRESHOLD = 0.8;

// ------------------------------------------------------------------- cloze
/**
 * Gap sentences mined from your own mistakes, held at once.
 *
 * Uncapped, a bad fortnight mines two hundred and the block stops being "your
 * own errors" and becomes a wall.
 */
export const CLOZE_BACKLOG_CAP = 40;
/** Gap cards offered in one session. */
export const CLOZE_PER_SESSION = 8;

// ------------------------------------------------------------------ review
/**
 * How long a grade can be taken back.
 *
 * Long enough to notice a mis-hit key, short enough that the block does not sit
 * there. The last card of a block shows a closing screen for this window rather
 * than stalling every review by five seconds — see ReviewBlock.
 */
export const UNDO_MS = 5000;

// -------------------------------------------------------------------- exam
/** A practice test: thirty questions, thirty minutes, timed. */
export const EXAM_MINUTES = 30;

// ------------------------------------------------------------------ browse
/** Words per page in Wortschatz. */
export const BROWSE_BATCH = 50;

// --------------------------------------------------------------- your text
/** Longest pasted text accepted by /text. About four A4 pages. */
export const TEXT_MAX_CHARS = 20_000;

// ----------------------------------------------------------------- walking
/** Seconds of silence after the German, before the English, in walk mode. */
export const WALK_THINK_SECONDS = 3;

// ------------------------------------------------------------------ outbox
/**
 * Answers held in the browser when the network is down.
 *
 * A queue that grows without limit eventually fills the storage quota and then
 * every write throws. Five hundred is more than a very long offline session.
 */
export const OUTBOX_MAX = 500;
