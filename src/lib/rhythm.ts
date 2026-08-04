/**
 * Which shape today's session takes. Pure arithmetic, no database.
 *
 * The session's rhythm is fixed but its content rotates — reading one day,
 * listening the next, speaking twice as often as writing, an old scenario every
 * third day. All of that used to be `dayIndex % 3` expressions scattered down
 * buildSession, which made it impossible to check: the day index comes from the
 * wall clock, so a test could only ever observe today, and a rotation that
 * quietly never fired would look exactly like the old behaviour.
 *
 * Separated here so the whole schedule can be walked across a month in a test
 * — the same reason pricing.ts is separate from cost.ts.
 *
 * Deterministic per calendar day, never random: reloading the page must not
 * reshuffle a session you are halfway through.
 */

export type Rhythm = {
  /** Reviews with the word hidden until you answer. Listening lags when all practice is on the page. */
  audioFirstReview: boolean;
  /** Which input block today gets. */
  input: "video" | "reading" | "listening";
  /** Read a text from a unit finished a while back instead of this unit's. */
  recycleReading: boolean;
  /** Which output block today gets. */
  output: "speaking" | "writing";
  /** Redo a conversation from a unit finished a while back. */
  recycleScenario: boolean;
};

export type Available = { video: boolean; reading: boolean };

/** Days since the epoch. The only place the clock is read. */
export function today(now = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

export function rhythmFor(dayIndex: number, has: Available): Rhythm {
  /* Video only counts when it has hand-marked segments; an unsegmented embed
     is a YouTube link, not a lesson. The caller resolves that before asking. */
  const inputSlots = has.video ? 3 : has.reading ? 2 : 1;
  const inputChoice = dayIndex % inputSlots;

  const input: Rhythm["input"] =
    has.video && inputChoice === 2 ? "video" : has.reading && inputChoice === 1 ? "reading" : "listening";

  /* Which reading day this is, counted in reading days rather than calendar
     days. Alternating on `dayIndex % 2` looked right and was not: with no video
     the input slot itself already rotates on `dayIndex % 2`, so "odd day" and
     "reading day" were the same condition and EVERY reading was a recycled one.
     No video has been imported yet, so that was the shipping behaviour. */
  const readingDay = Math.floor(dayIndex / inputSlots);

  return {
    audioFirstReview: dayIndex % 3 === 1,
    input,
    // Every other reading day. This unit's text is tied to words met this week
    // and is therefore the easy one; the old text is the honest test.
    recycleReading: input === "reading" && readingDay % 2 === 1,
    /* Speaking takes two slots of three, writing one. It used to be one of
       three with the third slot empty — a learner spoke aloud on a third of
       their days, in a course whose premise is self-study, where speaking is
       the skill nobody practises and the one that decides whether any of this
       works in a shop. It is also the only output skill that costs nothing per
       use: Web Speech runs in the browser, writing correction is a model call.
       The free skill was the rationed one. */
    output: dayIndex % 3 === 1 ? "writing" : "speaking",
    recycleScenario: dayIndex % 3 === 2,
  };
}
