/**
 * What the tutor remembers about this learner. Pure string building, no database.
 *
 * Separated from ai.ts for the same reason pricing.ts and rhythm.ts are
 * separated: this is a prompt, prompts are the part of an AI feature nobody
 * can see once it ships, and a silent regression here looks exactly like the
 * model having an off day.
 */

/**
 * `mistakes` are error tags the learner has actually made in the last
 * fortnight, in the plain-English descriptions the rest of the app uses;
 * `stuck` are words that keep lapsing out of the deck.
 */
export type Memory = { mistakes: string[]; stuck: string[] };

/**
 * The difference between a role-player and a teacher.
 *
 * Without this the tutor is a stranger every single day: it knows the word list
 * and nothing else, so it asks whatever the scene suggests and the learner's
 * actual weak spots come up only by luck. A human tutor who had watched you
 * miss accusative articles four times this week would steer the conversation
 * somewhere you need one — not announce it, just steer.
 *
 * Deliberately a short block of already-computed facts, not a summary of past
 * conversations. Nothing new is stored, nothing is inferred, and the whole
 * thing is a few dozen tokens.
 *
 * Returns null when there is nothing to say, so a learner with no recorded
 * mistakes does not get an empty "here is what you get wrong" heading — and so
 * the first week, when the data is thin, costs nothing extra.
 *
 * The caller places this AFTER the cache breakpoint. The lists change as the
 * learner answers, and putting them in the cached prefix would invalidate the
 * vocabulary whitelist — the largest cached block in the app — on every
 * mistake.
 */
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

  /* The hard part. A model told what someone struggles with will help by
     explaining it, which is the one thing this block must not cause: the
     correction pass runs afterwards for exactly that reason, and a tutor that
     stops to teach mid-sentence is how beginners stop talking. */
  parts.push(
    `Never mention any of this. Do not say you noticed a pattern, do not name a`,
    `grammar rule, do not correct them. This is what you steer towards, not what`,
    `you talk about — a lesson they can feel is a lesson they stop enjoying.`,
  );

  return parts.join("\n");
}
