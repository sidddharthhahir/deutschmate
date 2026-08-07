/**
 * The four options on a new-word check: four of them, one right, no pattern.
 * needs: seeded database
 */
import { ok, eq, section, done, open } from "./harness.mts";
import { fourChoices, senses } from "../src/lib/choices.ts";

/* Unit 1 of A1.1, in the order the block receives them. The first day a
   learner ever sees, and where every one of these bugs showed up. */
const db = open();
const unit1 = db
  .prepare(
    `SELECT w.id, w.en FROM word w
       JOIN unit u ON u.id = 'a1-1-u01'
      WHERE instr(u.word_ids_json, '"' || w.id || '"') > 0
      ORDER BY w.id`,
  )
  .all() as { id: string; en: string }[];

section("the deck under test");
ok(unit1.length >= 8, "unit 1 has enough words to build from", unit1.length);

section("every card offers four options, one of them right");
for (const w of unit1) {
  const opts = fourChoices(w, unit1);
  eq(opts.length, 4, `  ${w.en}: four options`);
  ok(opts.includes(w.en), `  …including the right one`);
  eq(new Set(opts).size, 4, `  …and no duplicates`);
}

section("no second right answer");
/* "hallo · hello" was offered against "guten Tag · good day / hello" and
   marked wrong for picking the one that also says hello. */
for (const w of unit1) {
  const mine = new Set(senses(w.en));
  const clash = fourChoices(w, unit1).filter(
    (o) => o !== w.en && senses(o).some((s) => mine.has(s)),
  );
  eq(
    clash.length,
    0,
    `  ${w.en}: no distractor shares its meaning${clash.length ? ` — ${clash.join(", ")}` : ""}`,
  );
}

section("there is no pattern to learn instead of the vocabulary");
const sets = unit1.map((w) => fourChoices(w, unit1));
const asKeys = sets.map((s) => s.join("|"));
ok(
  new Set(asKeys).size > unit1.length / 2,
  "the option sets differ between cards",
  `${new Set(asKeys).size} distinct sets across ${unit1.length} cards`,
);
const positions = new Set(unit1.map((w, i) => sets[i].indexOf(w.en)));
ok(
  positions.size >= 3,
  "and the right answer is not always in the same place",
  `positions used: ${[...positions].sort().join(", ")}`,
);

section("stable for a given word");
/* An option that moves between renders is a misgrade waiting to happen. */
for (const w of unit1.slice(0, 4))
  eq(
    fourChoices(w, unit1).join("|"),
    fourChoices(w, unit1).join("|"),
    `  ${w.en}: same order twice`,
  );

section("a small pool degrades rather than repeating itself");
const two = unit1.slice(0, 2);
const small = fourChoices(two[0], two);
ok(small.length <= 2, "no padding invented", `${small.length} options`);
eq(new Set(small).size, small.length, "and still no duplicates");

db.close();
done();
