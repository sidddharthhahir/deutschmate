import { aiAvailable, explainMistake } from "./ai";
import { recordUsage } from "./cost";
import {
  TAGS,
  cachedExplanation,
  classify,
  patternExplanation,
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
 * Four tiers, cheapest first (spec §12):
 *
 *   1. cache     this exact sentence and this exact wrong answer, explained
 *                before — free, instant, offline
 *   2. prebuilt  the general pattern behind the mistake, written by hand and
 *                seeded from data/error-patterns.json — also free and offline
 *   3. model     only on a miss, on the cheap model, and the result is STORED,
 *                so the next person to make it gets tier 1
 *   4. rule      the tag classifier's own description of the error
 *
 * Tier 2 is the one spec §12 planned and nobody built. It changes the economics
 * as well as the offline experience: the errors it covers — articles, cases,
 * verb endings, haben vs sein, nicht vs kein — are most of what a beginner
 * actually gets wrong, so most mistakes now cost nothing at all to explain.
 *
 * Tier 4 is why this never fails. With no key, no network, or a spent budget,
 * "**Akkusativ nach bestimmten Verben**" is still true and still useful — the
 * session never stalls waiting on an explanation (spec §17).
 */
export type Why = { text: string; source: "cache" | "prebuilt" | "model" | "rule"; tags: Tag[] };

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

  const known = patternExplanation(expected, answer, tags);
  if (known) return { text: known, source: "prebuilt", tags };

  if (aiAvailable(userId)) {
    try {
      const m = await explainMistake(userId, expected, answer, tags);
      recordUsage(userId, "mistake", m.model, m.usage);
      if (m.result) {
        // Attributed to whoever's key paid for it, so it can be withdrawn.
        storeExplanation(tags[0] ?? "vocabulary", sig, m.result, "generated", userId);
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
