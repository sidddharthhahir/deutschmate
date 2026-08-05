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

/** "Warum?" — the answer behind every wrong answer. */
export type Why = {
  text: string;
  source: "cache" | "prebuilt" | "model" | "rule";
  tags: Tag[];
};

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
        storeExplanation(
          tags[0] ?? "vocabulary",
          sig,
          m.result,
          "generated",
          userId,
        );
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
