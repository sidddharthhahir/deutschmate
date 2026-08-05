/**
 * The pure text functions: cloze gaps and exam scoring.
 * needs: nothing
 */
import { scoreExam } from "../src/lib/exam-score.ts";
import { blankAt, blankWord, blankForError } from "../src/lib/cloze-text.ts";
import { eq, section, done } from "./harness.mts";

section("blankForError — a gap made from the learner's own mistake");
eq(
  blankForError("Ich esse einen Apfel.", "Ich esse ein Apfel."),
  { sentence: "Ich esse ___ Apfel.", answer: "einen" },
  "substitution mid-sentence",
);
eq(
  blankForError("Der Mann liest.", "Die Mann liest."),
  { sentence: "___ Mann liest.", answer: "Der" },
  "substitution at the start",
);
eq(
  blankForError("Ich habe einen Hund.", "Ich habe Hund."),
  { sentence: "Ich habe ___ Hund.", answer: "einen" },
  "omission",
);
eq(
  blankForError("Wir gehen ins Kino.", "Wir gehen ins Kino"),
  null,
  "punctuation-only difference is not a gap",
);
eq(
  blankForError("Heute gehe ich ins Kino.", "Heute ich gehe ins Kino."),
  null,
  "reordering is refused",
);
eq(
  blankForError("Wir trinken kalten Tee.", "Wir trinkt warmen Tee."),
  null,
  "two substitutions are refused",
);
eq(blankForError("Ich bin da.", ""), null, "empty answer is refused");
eq(
  blankForError("Er geht.", "Er geht sehr schnell nach Hause."),
  null,
  "rewrite is refused",
);
eq(
  blankForError("Sie kommt aus Berlin.", "Sie kommt aus Berlin!"),
  null,
  "differing final punctuation only is refused",
);
eq(
  blankForError("Das ist mein Haus.", "Das ist mein Auto."),
  { sentence: "Das ist mein ___.", answer: "Haus" },
  "final word keeps its full stop",
);

section("blankWord");
eq(
  blankWord("Guten Morgen, Frau Müller.", "Morgen"),
  { sentence: "Guten ___, Frau Müller.", answer: "Morgen" },
  "exact match keeps the comma",
);
eq(
  blankWord("Die Häuser sind alt.", "Haus"),
  { sentence: "Die ___ sind alt.", answer: "Häuser" },
  "stem match finds the inflected form",
);
eq(blankWord("Ich fahre Rad.", "Zeitung"), null, "absent word returns null");
eq(
  blankWord("Er ist da.", "ist"),
  { sentence: "Er ___ da.", answer: "ist" },
  "short exact word",
);

section("blankAt");
eq(
  blankAt("Hallo, wie geht es dir?", 0),
  { sentence: "___, wie geht es dir?", answer: "Hallo" },
  "leading word, trailing comma kept",
);
eq(blankAt("Eins zwei drei", 9), null, "out of range");

section("scoreExam");
const q = (id: string, answer: number) => ({
  id,
  section: "wortschatz" as const,
  prompt: id,
  options: ["a", "b", "c"],
  answer,
});
const exam = {
  level: "A1.1",
  minutes: 30,
  total: 4,
  sections: [
    {
      key: "lesen",
      title: "Lesen",
      instruction: "",
      questions: [q("l1", 0), q("l2", 1)],
    },
    {
      key: "grammatik",
      title: "Grammatik",
      instruction: "",
      questions: [q("g1", 2), q("g2", 0)],
    },
  ],
} as Parameters<typeof scoreExam>[0];

eq(scoreExam(exam, [0, 1, 2, 0]).correct, 4, "all right");
eq(scoreExam(exam, [1, 0, 0, 1]).correct, 0, "all wrong");
eq(
  scoreExam(exam, [0, null, 2, null]).correct,
  2,
  "skipped questions score zero, never crash",
);
eq(
  scoreExam(exam, [0, 1, 0, 0]).sections.map(
    (s) => `${s.key}:${s.correct}/${s.total}`,
  ),
  ["lesen:2/2", "grammatik:1/2"],
  "per-section split is right",
);
eq(scoreExam(exam, []).correct, 0, "no answers at all");

/* The case the old indexOf-based scorer got wrong: one question object reused
   in two sections scored at whichever position indexOf found first. */
const dup = q("same", 1);
const shared = {
  level: "A1.1",
  minutes: 30,
  total: 2,
  sections: [
    { key: "lesen", title: "Lesen", instruction: "", questions: [dup] },
    { key: "grammatik", title: "Grammatik", instruction: "", questions: [dup] },
  ],
} as Parameters<typeof scoreExam>[0];
eq(
  scoreExam(shared, [1, 0]).sections.map((s) => s.correct),
  [1, 0],
  "a repeated question is scored at each of its own positions",
);

done();
