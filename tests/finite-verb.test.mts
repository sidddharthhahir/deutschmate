/**
 * Only say "your verb is in the wrong place" when there is a verb.
 * needs: nothing
 */
import { ok, eq, section, done } from "./harness.mts";
import { looksFinite, finiteIndex, orderTag } from "../src/lib/finite-verb.ts";
import { patternFor } from "../src/lib/error-key.ts";
import { classify } from "../src/lib/errors.ts";

const words = (s: string) => s.split(/\s+/);

section("the sentence that started this");
/* Unit 2 of day one. A learner reorders a greeting with no verb in it and was
   answered with the rule about the conjugated verb coming second, illustrated
   with someone going to the cinema. */
eq(
  orderTag(words("Tschüss, bis morgen!"), words("bis morgen Tschüss,!")),
  "word-order",
  "a verbless fragment is a word-order mistake, not a verb-position one",
);
eq(
  patternFor("Tschüss, bis morgen!", "bis morgen Tschüss,!"),
  "order:word-order",
  "…and the explanation key agrees",
);
eq(
  orderTag(
    words("Guten Morgen, Frau Weber."),
    words("Guten Frau Weber Morgen,."),
  ),
  "word-order",
  "three capitalised words and no verb",
);

section("a real verb-second mistake still lands");
eq(
  orderTag(words("Heute gehe ich ins Kino"), words("Heute ich gehe ins Kino")),
  "verb-position-2",
  "the verb was moved out of second place",
);
eq(
  patternFor("Heute gehe ich ins Kino", "Heute ich gehe ins Kino"),
  "order:verb-position-2",
  "…and so does the key",
);
eq(
  orderTag(words("Ich wohne jetzt hier"), words("Ich wohne hier jetzt")),
  "word-order",
  "the verb stayed put, so it is the rest of the clause",
);

section("what counts as a conjugated verb");
for (const v of ["ist", "hat", "kann", "wohne", "gehst", "arbeitet", "wusste"])
  ok(looksFinite(v), `  ${v}`);
for (const n of ["morgen", "Tschüss", "Frau", "Kino", "bis", "gern", "nicht"])
  ok(!looksFinite(n), `  not ${n}`);

eq(finiteIndex(words("Tschüss, bis morgen!")), -1, "no verb found");
eq(finiteIndex(words("Heute gehe ich ins Kino")), 1, "found at index 1");

section("verb-ending is not claimed for words that are not verbs");
/* "Guten" against "Gute" was filed as a wrong verb ending, because the rule
   asked only that the first min(len)-2 characters matched — two characters for
   two four-letter words. The top three tags become tomorrow's Fix drills, so
   this had a beginner drilling conjugation for picking the wrong greeting. */
const greeting = classify("Guten Tag!", "Gute Nacht!");
ok(
  !greeting.includes("verb-ending"),
  "an adjective ending is not a verb ending",
  greeting.join(", ") || "(no tags)",
);
const real = classify("Du gehst nach Hause", "Du gehe nach Hause");
ok(
  real.includes("verb-ending"),
  "…but a real one is still caught",
  real.join(", "),
);

section("punctuation does not hide a reordering");
/* classify() split on whitespace without stripping punctuation, so the moved
   "!" made this a different multiset and it fell through to `vocabulary` —
   which is also what the Fix block then drilled. error-key.ts always stripped,
   so the two classifiers disagreed about the same answer. */
const moved = classify("Tschüss, bis morgen!", "bis morgen Tschüss,!");
ok(
  moved.includes("word-order"),
  "a reordering is seen through the punctuation",
  moved.join(", "),
);
ok(
  !moved.includes("vocabulary"),
  "and is not filed as a wrong word",
  moved.join(", "),
);

done();
