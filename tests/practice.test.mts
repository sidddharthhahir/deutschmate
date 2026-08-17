/**
 * The practice section, guarding three faults that shipped and then survived a
 * full 38-suite run without anything going red.
 * needs: seeded database
 */
import { ok, eq, section, done } from "./harness.mts";
import { fourChoices } from "../src/lib/choices.ts";
import { pairsFor, SOUNDS } from "../src/lib/pairs.ts";
import { buildExam } from "../src/lib/exam.ts";
import { all } from "../src/lib/db.ts";

section("a quiz does not offer the same four options every question");
/*
 * The reported bug, on the unit that produced it: "Zahlen 0-20" asked four
 * questions in a row whose options were identical — eight, number, three, one —
 * so after the first you could answer the rest by elimination without reading
 * any German. The route took the first three other words of a pool that does
 * not change between questions.
 */
const pool = all<{ id: string; lemma: string; en: string }>(
  `SELECT DISTINCT w.id, w.lemma, w.en FROM word w
     JOIN unit u ON u.title LIKE '%ahl%'
    WHERE instr(u.word_ids_json, w.id) > 0
    LIMIT 12`,
);
ok(pool.length >= 4, "the numbers unit has a usable pool", pool.length);

const sets = pool
  .map((w) => fourChoices(w, pool))
  .filter((o) => o.length === 4)
  .map((o) => [...o].sort().join("|"));

ok(sets.length >= 4, "enough questions to compare", sets.length);
eq(new Set(sets).size, sets.length, "every question gets a different set");

/* The answer must also move around, or its position becomes the pattern. */
const positions = new Set(
  pool
    .map((w) => ({ w, opts: fourChoices(w, pool) }))
    .filter((x) => x.opts.length === 4)
    .map((x) => x.opts.indexOf(x.w.en)),
);
ok(positions.size > 1, "the right answer is not always in the same slot");

section("a distractor is never a second right answer");
for (const w of pool.slice(0, 6)) {
  const opts = fourChoices(w, pool);
  if (opts.length < 4) continue;
  const dupes = opts.filter((o) => o === w.en).length;
  eq(dupes, 1, `"${w.lemma}" offers its answer exactly once`);
}

section("listening never plays a word and demands a sentence");
/*
 * word.audio_url is a recording of the lemma — "hallo" — while the answer is
 * the whole example sentence, "Hallo, ich bin Mira." Playing the file asked the
 * learner to pick a sentence off the sound of one word. There is no sentence
 * recording anywhere, so the correct value is null, which falls through to
 * synthesis and reads the sentence.
 */
const exam = buildExam("A1.2");
const hoeren = exam.sections.find((s) => s.key === "hoeren");
ok(hoeren, "the exam has a listening section");
if (hoeren) {
  for (const q of hoeren.questions) {
    eq(q.audio, null, "no word recording stands in for a sentence");
    eq(q.options.length, 4, "and the question has four options");
    ok(
      q.answer >= 0 && q.answer < q.options.length,
      "the answer index points at a real option",
      q.answer,
    );
    eq(new Set(q.options).size, 4, "and the four are distinct");
  }
}

section("no pronunciation drill is a single card on a loop");
/*
 * Four of the twelve sounds have exactly one pair, and the page opens on
 * whichever sound the learner is weakest at — so the drill could be one card,
 * which it then repeated for ever because next() wrapped with a modulo.
 */
for (const s of SOUNDS) {
  ok(pairsFor(s, 10).length >= 4, `"${s}" is a real drill`, pairsFor(s, 10).length);
}

done();
