import { aiAvailable, explainMistake } from "./ai";
import { recordUsage } from "./cost";
import {
  TAGS,
  cachedExplanation,
  classify,
  signatureFor,
  storeExplanation,
  type Tag,
} from "./errors";

/**
 * "Warum?" — the answer behind every wrong answer.
 *
 * Telling a learner the right answer is a lookup; telling them the rule is a
 * lesson. This is the one thing the app does after a mistake, so it lives in
 * one place and every block that can be wrong calls it.
 *
 * Three tiers, cheapest first (spec §12):
 *
 *   1. cache    a mistake someone has already made — free, instant, offline
 *   2. model    only on a miss, on the cheap model, and the result is STORED,
 *               so the next person to make it gets tier 1
 *   3. rule     the tag classifier's own description of the error
 *
 * Tier 3 is why this never fails. With no key, no network, or a spent budget,
 * "**Akkusativ nach bestimmten Verben**" is still true and still useful — the
 * session never stalls waiting on an explanation (spec §17).
 */
export type Why = { text: string; source: "cache" | "model" | "rule"; tags: Tag[] };

export async function whyWrong(
  userId: string,
  expected: string,
  answer: string,
  knownTags?: Tag[],
): Promise<Why> {
  const tags = knownTags?.length ? knownTags : classify(expected, answer);
  const sig = signatureFor(expected, answer);

  const hit = cachedExplanation(sig);
  if (hit) return { text: hit, source: "cache", tags };

  if (aiAvailable()) {
    try {
      const m = await explainMistake(userId, expected, answer, tags);
      recordUsage(userId, "mistake", m.model, m.usage);
      if (m.result) {
        storeExplanation(tags[0] ?? "vocabulary", sig, m.result, "generated");
        return { text: m.result, source: "model", tags };
      }
    } catch {
      /* No key, budget spent, network down, malformed response — all of them
         mean the same thing here: fall through to the rule. */
    }
  }

  return {
    text: tags.map((t) => `**${TAGS[t] ?? t}**`).join("\n\n"),
    source: "rule",
    tags,
  };
}
