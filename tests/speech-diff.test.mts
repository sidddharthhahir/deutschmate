/**
 * What the speaking block shows you was heard, and what it shows it as.
 * needs: nothing
 */
import { diffWords } from "../src/lib/speech.ts";
import { ok, eq, section, done } from "./harness.mts";

const shown = (t: string, h: string) => diffWords(t, h).map((d) => d.word);
const heard = (t: string, h: string) =>
  diffWords(t, h)
    .filter((d) => d.ok)
    .map((d) => d.word);

section("matching ignores case and punctuation");
/* A recogniser's idea of either means nothing — it is transcribing sound. */
eq(
  heard("Hallo, ich bin Mira.", "hallo ich bin mira").length,
  4,
  "every word counts as heard whatever the casing",
);
eq(
  heard("Tschüss, bis morgen!", "Tschüss bis morgen").length,
  3,
  "and whatever the punctuation",
);

section("but the words are shown as they are written");
/* This is displayed under the sentence, in a language where capitalisation is
   a rule the course teaches and an error tag it tracks. It used to lower-case
   the lot, so a learner saw "tschüss" and "morgen". */
eq(
  shown("Tschüss, bis morgen!", "Tschüss bis morgen").join(" "),
  "Tschüss bis morgen",
  "capitals survive",
);
eq(
  shown("Ich heiße Mira.", "ich heisse mira").join(" "),
  "Ich heiße Mira",
  "…and so does ß, while the trailing stop does not",
);

section("a word that was not heard is marked, not dropped");
const partial = diffWords("Tschüss, bis morgen!", "Tschüss bis Quatsch");
eq(partial.length, 3, "every target word is still listed");
eq(
  partial
    .filter((d) => !d.ok)
    .map((d) => d.word)
    .join(","),
  "morgen",
  "and the missing one is the one that was missing",
);

section("nothing heard is nothing right, and never a crash");
eq(
  diffWords("Guten Tag!", "").filter((d) => d.ok).length,
  0,
  "empty transcript",
);
eq(
  diffWords("Guten Tag!", "   ").filter((d) => d.ok).length,
  0,
  "whitespace only",
);
ok(diffWords("", "irgendwas").length === 0, "an empty target yields no words");

section("a longer transcript does not invent matches");
eq(
  heard("Guten Tag!", "Guten Tag und auf Wiedersehen").length,
  2,
  "extra words the learner said are simply not counted against the target",
);

done();
