/**
 * Sentences are gated on the grammar they use, not on how common their words are.
 * needs: nothing
 */
import { ok, eq, section, done } from "./harness.mts";
import {
  structuresIn,
  needsUnit,
  isReachable,
} from "../src/lib/sentence-grammar.ts";

section("the sentence that started this");
/*
 * "Mein Vater ist der, der Tee trinkt" was served in A1.1 Sätze bauen. Every
 * word in it is common — Vater, ist, Tee, trinkt — which is exactly why word
 * frequency filed it as beginner material. It is a relative clause.
 */
const rel = "Mein Vater ist der, der Tee trinkt.";
ok(
  structuresIn(rel).includes("relativsatz"),
  "it is seen as a relative clause",
);
eq(needsUnit(rel), 99, "which puts it outside A1 entirely");
ok(!isReachable(rel, 12), "so a learner finishing A1.1 never sees it");
ok(!isReachable(rel, 40), "nor one finishing all of A1");

section("simple present is reachable from the start");
for (const s of [
  "Ich bin müde.",
  "Das Buch ist neu.",
  "Der Mann wohnt hier.",
]) {
  ok(isReachable(s, 12), `"${s}"`, `unit ${needsUnit(s)}`);
}

section("each structure waits for its unit");
/*
 * Momente A1.1 is 12 units, denser than the course this scale was first
 * calibrated for: accusative by 6, modal by 7, Perfekt by 11. Dative and
 * two-way prepositions aren't taught in A1.1 at all yet, so they still read 99.
 */
const cases: [string, number, string][] = [
  ["Ich sehe den Mann.", 6, "accusative"],
  ["Ich kann nicht kommen.", 7, "modal"],
  ["Können Sie mir helfen?", 99, "dative"],
  ["Ich habe Brot gekauft.", 11, "Perfekt"],
  ["Das Buch liegt auf dem Tisch.", 99, "two-way preposition"],
  ["Ich weiß, dass er kommt.", 99, "subordinate clause — not A1"],
  ["Ich wäre gern dabei.", 99, "Konjunktiv — not A1"],
  ["Das Haus wurde gebaut.", 99, "passive — not A1"],
];
for (const [s, want, why] of cases) {
  eq(needsUnit(s), want, `${why}: "${s}"`);
}

section("a structure is not reachable one unit early");
ok(!isReachable("Ich sehe den Mann.", 5), "accusative is not free at unit 5");
ok(isReachable("Ich sehe den Mann.", 6), "and is at 6");
ok(!isReachable("Ich habe Brot gekauft.", 10), "Perfekt is not free at 10");
ok(isReachable("Ich habe Brot gekauft.", 11), "and is at 11");

section("the hardest structure in the sentence wins");
/* Negation is unit 2 and the Perfekt is 11, so this waits for 11. */
const both = "Ich habe das nicht gesehen.";
eq(needsUnit(both), 11, "negation plus Perfekt waits for the Perfekt");
ok(
  structuresIn(both).includes("negation") &&
    structuresIn(both).includes("perfekt"),
  "and both are actually detected",
  structuresIn(both).join(" "),
);

section("Perfekt is not mistaken for Präteritum");
/* "hat gesagt" is the spoken past. Reading the auxiliary alone as Präteritum
   would push every Perfekt sentence out of A1. */
ok(
  structuresIn("Er hat das gesagt.").includes("perfekt"),
  "hat + participle is Perfekt",
);
ok(
  !structuresIn("Er hat das gesagt.").includes("praeteritum"),
  "and not Präteritum",
);
ok(
  structuresIn("Ich war gestern dort.").includes("praeteritum"),
  "war alone is Präteritum",
);

section("questions are questions, not imperatives");
ok(structuresIn("Wie heißt du?").includes("fragen"), "a W-question");
ok(
  !structuresIn("Wie heißt du?").includes("imperativ"),
  "and not an imperative",
);
ok(
  structuresIn("Warten Sie bitte.").includes("imperativ"),
  "the formal imperative is one",
);

section("a phrase the course teaches whole is not blocked by its own grammar");
/*
 * "Wie geht es dir?" is unit 4 and contains a dative, which is unit 29. Both are
 * true, and the curriculum has to win — otherwise the gate blocks the sentence
 * the course itself put in front of the learner on day four.
 */
eq(needsUnit("Wie geht es dir?"), 4, "the greeting is reachable at unit 4");
eq(needsUnit("Es geht mir gut."), 4, "and so is the answer to it");
ok(isReachable("Wie geht es dir?", 4), "so unit 4 may use it");
/* But the exception is literal, not a general amnesty for the dative. */
ok(
  !isReachable("Ich gebe dir das Buch.", 12),
  "an ordinary dative sentence is still gated",
  `unit ${needsUnit("Ich gebe dir das Buch.")}`,
);

section("every sentence gets an answer, and it is a number");
for (const s of ["", "   ", "Ja.", "!!!", "Hallo"]) {
  const n = needsUnit(s);
  ok(
    Number.isFinite(n) && n >= 1,
    `"${s}" is classified rather than crashing`,
    String(n),
  );
}

done();
