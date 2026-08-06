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

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Half a sentence, or nothing much. Says so instead of explaining grammar that
 * did not go wrong. Null when the answer is a real attempt at the whole thing.
 */
function incomplete(expected: string, answer: string): string | null {
  const want = words(expected);
  const got = words(answer);
  if (want < 4 || got === 0) return null;
  // Less than half of it, and at least two words missing.
  if (got > want / 2 || want - got < 2) return null;
  return `Das war erst der Anfang — ${got} von ${want} Wörtern. Der Rest des Satzes fehlt, also liegt es hier nicht an der Grammatik. Hör ihn dir nochmal an und schreib ihn ganz.`;
}

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

  /*
   * A fragment is not a grammar mistake, and answering it with grammar is worse
   * than saying nothing. Typing "Guten Abend" for "Guten Abend, kommen Sie
   * herein." was met with an explanation of present-tense verb endings — true
   * about German, unrelated to what happened, and the learner has no way to know
   * which. Checked before the pattern tier, because a half-written sentence will
   * always resemble some pattern.
   */
  const short = incomplete(expected, answer);
  if (short) return { text: short, source: "rule", tags };

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
