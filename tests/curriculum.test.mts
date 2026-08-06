/**
 * The A1 teaching order. The order IS the design, so it is asserted.
 * needs: nothing
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ok, eq, section, done } from "./harness.mts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

type Unit = {
  ord: number;
  level: string;
  id: string;
  title: string;
  canDo: string[];
  grammar: string | null;
  grammarNote: string;
  topics: string[];
  words: number;
};

const { units } = JSON.parse(
  readFileSync(join(ROOT, "data/curriculum-a1.json"), "utf8"),
) as { units: Unit[] };

section("forty units, numbered and named");
eq(units.length, 40, "all of A1");
eq(units.filter((u) => u.level === "A1.1").length, 20, "twenty in A1.1");
eq(units.filter((u) => u.level === "A1.2").length, 20, "twenty in A1.2");
ok(
  units.every((u, i) => u.ord === i + 1),
  "ord runs 1..40 with no gap",
);
eq(new Set(units.map((u) => u.id)).size, 40, "no two units share an id");
eq(new Set(units.map((u) => u.title)).size, 40, "no two share a title");

section("every unit says what you can do and why it sits there");
for (const u of units) {
  ok(
    u.canDo.length >= 2,
    `${u.ord} ${u.title}: can-do statements`,
    String(u.canDo.length),
  );
}
ok(
  units.every((u) => u.grammarNote && u.grammarNote.length > 20),
  "every unit records the reasoning for its position",
);
ok(
  units.every((u) => u.words >= 8 && u.words <= 16),
  "nobody gets a 30-word day or a 3-word one",
);

section("nothing is used before it is taught");
/*
 * This is the whole point. The old curriculum served a relative clause in A1.1
 * because it sorted by word frequency and never asked what grammar a sentence
 * needed. These pairs are the dependencies that actually bite.
 */
const at = new Map<string, number>();
for (const u of units)
  if (u.grammar && !at.has(u.grammar)) at.set(u.grammar, u.ord);

/*
 * Real grammar ids, not the working names the plan was drafted with. Most of
 * these points already existed under a g- id, so the plan was remapped rather
 * than a second copy of praesens-regular being written. A pair naming an id
 * nothing teaches is skipped below, which is how the A1.2 points that are still
 * unwritten stay out of the way without weakening the ones that exist.
 */
const after: [string, string][] = [
  ["g-akkusativ", "g-articles-nom"],
  ["g-dativ", "g-akkusativ"],
  ["g-wechselpraep", "g-dativ"],
  ["g-praesens", "g-sein"],
  ["g-perfekt-haben", "g-praesens"],
  ["g-perfekt-sein", "g-perfekt-haben"],
  ["g-trennbare", "g-modalverben"],
  ["g-es-gibt", "g-akkusativ"],
  ["g-uhrzeit", "g-zahlen"],
  ["g-zeitpraepositionen", "g-uhrzeit"],
];
let checked = 0;
for (const [later, earlier] of after) {
  const l = at.get(later);
  const e = at.get(earlier);
  if (l === undefined || e === undefined) continue; // not written yet
  checked++;
  ok(l > e, `${later} comes after ${earlier}`, `unit ${e} → unit ${l}`);
}
ok(
  checked >= 5,
  "enough of the ordering is written to be worth asserting",
  `${checked} pairs`,
);

section("the foundation this course was missing arrives early");
/* Reported from real use: "we should introduce alphabet, number, time reading
   and all — der die das — this is the base right?" It was not there at all. */
for (const [what, by] of [
  ["g-alphabet", 5],
  ["g-articles-nom", 8],
  ["g-uhrzeit", 12],
] as [string, number][]) {
  const unit = at.get(what);
  ok(
    unit !== undefined && unit <= by,
    `${what} taught by unit ${by}`,
    `unit ${unit}`,
  );
}
ok(
  units.some((u) => u.topics.includes("numbers") && u.ord <= 3),
  "numbers start in the first three days",
);

section("the hardest thing in A1 is last");
eq(at.get("g-wechselpraep"), 39, "two-way prepositions at 39, not earlier");

section("every grammar point A1.1 names actually exists");
/* The plan was drafted with working names and several of those points were
   already written under a g- id. A unit pointing at a name nobody wrote teaches
   vocabulary and no rule, silently — so A1.1, which is finished, must be whole. */
/* Both files: four A1 points are the ones already written for A2.1 — reused
   rather than duplicated, because a second explanation of the dative is the
   duplication this rewrite exists to remove. */
const realIds = new Set(
  ["data/grammar-a1.json", "data/grammar-a2.json"]
    .flatMap(
      (f) =>
        JSON.parse(readFileSync(join(ROOT, f), "utf8")) as { id: string }[],
    )
    .map((g) => g.id),
);
const dangling = units
  .filter((u) => u.grammar && !realIds.has(u.grammar))
  .map((u) => `${u.ord}:${u.grammar}`);
ok(
  dangling.length === 0,
  "no unit points at a grammar point that was never written",
  dangling.join(", ") || "all 40 present",
);
eq(
  units[39].grammar,
  null,
  "and unit 40 introduces nothing — it is the payoff",
);

section("the deck it implies is the right size");
const words = units.reduce((n, u) => n + u.words, 0);
ok(
  words >= 400 && words <= 560,
  "roughly a Goethe A1 vocabulary",
  `${words} words`,
);

// ------------------------------------------------------------- vocabulary

type Word = {
  id: string;
  lemma: string;
  article?: string;
  plural?: string;
  pos: string;
  en: string;
  topic: string;
  unit: number;
};

const { words: vocab } = JSON.parse(
  readFileSync(join(ROOT, "data/vocab-a1.json"), "utf8"),
) as { words: Word[] };

const written = [...new Set(vocab.map((w) => w.unit))].sort((a, b) => a - b);

section("the vocabulary written so far");
ok(vocab.length > 0, "there is some", `${vocab.length} words`);
eq(new Set(vocab.map((w) => w.id)).size, vocab.length, "no duplicate ids");
/*
 * Lemma AND part of speech. German uses one word for two jobs — sein is both
 * "to be" and "his", ihr is both "her" and "their" — and those are two things
 * to learn, not a duplicate. Keying on the lemma alone would forbid teaching
 * the second one.
 */
eq(
  new Set(vocab.map((w) => `${w.lemma}|${w.pos}`)).size,
  vocab.length,
  "no word is taught twice in the same role",
);
ok(
  written.every((u, i) => u === i + 1),
  "units are written in order with no gaps",
  `1..${written[written.length - 1]}`,
);

section("every noun carries its article and plural");
/*
 * A German noun without its gender is half a word, and the old deck taught
 * 2,255 of them that way. Proper nouns are the only exception — Deutschland has
 * no plural anybody uses.
 */
const nouns = vocab.filter((w) => w.pos === "noun");
ok(nouns.length > 0, "there are nouns", String(nouns.length));
for (const n of nouns) {
  ok(
    n.article === "der" || n.article === "die" || n.article === "das",
    `${n.lemma}: has an article`,
    String(n.article),
  );
}
const countable = nouns.filter(
  (n) => !["deutschland", "oesterreich", "die-schweiz"].includes(n.id),
);
ok(
  countable.every((n) => Boolean(n.plural)),
  "every countable noun has a plural",
  countable.find((n) => !n.plural)?.lemma ?? "all present",
);

section("every word is filed, so the null-topic problem cannot come back");
ok(
  vocab.every((w) => Boolean(w.topic)),
  "every word has a topic",
);
ok(
  vocab.every((w) => Boolean(w.en) && Boolean(w.pos)),
  "and a gloss and a part of speech",
);

section("the vocabulary matches the plan it was written against");
for (const u of written) {
  const unit = units.find((x) => x.ord === u)!;
  const got = vocab.filter((w) => w.unit === u).length;
  ok(
    Math.abs(got - unit.words) <= 2,
    `unit ${u} ${unit.title}: ${got} words, plan says ${unit.words}`,
  );
}

done();
