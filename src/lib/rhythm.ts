/** Which shape today's session takes. */

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
    has.video && inputChoice === 2
      ? "video"
      : has.reading && inputChoice === 1
        ? "reading"
        : "listening";

  /* Which reading day this is, counted in reading days rather than calendar days. */
  const readingDay = Math.floor(dayIndex / inputSlots);

  return {
    audioFirstReview: dayIndex % 3 === 1,
    input,
    // Every other reading day. This unit's text is tied to words met this week
    // and is therefore the easy one; the old text is the honest test.
    recycleReading: input === "reading" && readingDay % 2 === 1,
    /*
     * Speaking takes two slots of three, writing one. It is also the only output skill that costs
     * nothing per use: Web Speech runs in the browser, writing correction is a model call.
     */
    output: dayIndex % 3 === 1 ? "writing" : "speaking",
    recycleScenario: dayIndex % 3 === 2,
  };
}
