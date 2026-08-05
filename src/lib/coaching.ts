/** What the tutor remembers about this learner. */

/**
 * `mistakes` are error tags the learner has actually made in the last
 * fortnight, in the plain-English descriptions the rest of the app uses;
 * `stuck` are words that keep lapsing out of the deck.
 */
export type Memory = { mistakes: string[]; stuck: string[] };

/** The difference between a role-player and a teacher. */
export function coachingBrief(memory: Memory): string | null {
  const mistakes = memory.mistakes.filter((s) => s.trim());
  const stuck = memory.stuck.filter((s) => s.trim());
  if (!mistakes.length && !stuck.length) return null;

  const parts = ["QUIETLY STEER — this learner specifically"];

  if (mistakes.length) {
    parts.push(
      `They keep getting these wrong: ${mistakes.join("; ")}.`,
      `Where it fits the scene, ask something whose natural answer needs one of`,
      `them. Use the structure correctly in your own turns so they hear it right.`,
    );
  }

  if (stuck.length) {
    parts.push(
      `These words keep slipping away from them: ${stuck.join(", ")}.`,
      `Work one or two into the conversation if you naturally can.`,
    );
  }

  /* The hard part. */
  parts.push(
    `Never mention any of this. Do not say you noticed a pattern, do not name a`,
    `grammar rule, do not correct them. This is what you steer towards, not what`,
    `you talk about — a lesson they can feel is a lesson they stop enjoying.`,
  );

  return parts.join("\n");
}
