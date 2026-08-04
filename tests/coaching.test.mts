/**
 * The brief that makes the tutor a teacher rather than a stranger.
 *
 * This is a prompt, and a prompt is the part of an AI feature nobody can see
 * once it ships — a regression here reads as the model having an off day. So
 * the two properties that carry the whole idea are pinned:
 *
 *   the learner's actual weak spots reach the model, and
 *   the model is told, unambiguously, never to mention them.
 *
 * The second matters as much as the first. A model handed "they keep confusing
 * der and den" will try to help by explaining it, which is exactly what the
 * conversation block must not do — corrections run afterwards, on purpose,
 * because a tutor that stops to teach mid-sentence is how beginners stop
 * talking.
 *
 * needs: nothing
 */
import { coachingBrief } from "../src/lib/coaching.ts";
import { ok, eq, section, done } from "./harness.mts";

section("nothing to say, nothing said");
/* A learner in their first week has no recorded mistakes. An empty "here is
   what you get wrong" heading would be both useless and slightly insulting,
   and it would cost tokens on every turn to say nothing. */
eq(coachingBrief({ mistakes: [], stuck: [] }), null, "no memory, no block");
eq(coachingBrief({ mistakes: ["  "], stuck: [""] }), null, "blank strings do not count as memory");

section("what the learner gets wrong reaches the model");
const b = coachingBrief({
  mistakes: ["Nominative article where accusative is needed", "Verb not in second position"],
  stuck: ["die Rechnung", "vielleicht"],
})!;
ok(b !== null, "a brief is produced");
ok(b.includes("Nominative article where accusative is needed"), "the first mistake is named");
ok(b.includes("Verb not in second position"), "and the second");
ok(b.includes("die Rechnung") && b.includes("vielleicht"), "so are the stuck words");

section("and the model is told to keep it to itself");
/* Three separate prohibitions, because a model that breaks any one of them
   turns a conversation into a lesson. */
ok(/never mention/i.test(b), "told not to mention it");
ok(/do not correct/i.test(b), "told not to correct");
ok(/do not name a\s+grammar rule/i.test(b), "told not to name the rule", b.split("\n").at(-2));

section("each half stands alone");
/* Mistakes and stuck words arrive from different queries and either can be
   empty — a learner can have lapsing words and a clean fortnight, or the
   reverse. Neither should produce a dangling sentence about the other. */
const onlyMistakes = coachingBrief({ mistakes: ["Wrong plural form"], stuck: [] })!;
ok(onlyMistakes.includes("Wrong plural form"), "mistakes alone still produce a brief");
ok(!/slipping away/i.test(onlyMistakes), "with no sentence about words that are not there");

const onlyStuck = coachingBrief({ mistakes: [], stuck: ["der Termin"] })!;
ok(onlyStuck.includes("der Termin"), "stuck words alone still produce a brief");
ok(!/keep getting these wrong/i.test(onlyStuck), "with no empty mistake list");

section("it stays small");
/* This rides on every single chat turn, after the cache breakpoint, so it is
   billed at full price every time. Three tags and four words is enough to
   steer ten minutes of conversation; a transcript summary would not be. */
const big = coachingBrief({
  mistakes: ["a", "b", "c"],
  stuck: ["w", "x", "y", "z"],
})!;
ok(big.length < 700, "well under a thousand characters", `${big.length} chars`);

done();
