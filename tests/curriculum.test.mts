/**
 * The A1 teaching order. The order IS the design, so it is asserted.
 * needs: seeded database
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ok, eq, section, done, open } from "./harness.mts";

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
 * Lemma, part of speech AND gloss. German uses one word for several jobs, and
 * those are several things to learn, not duplicates. Keying on the lemma alone
 * would forbid teaching the second one.
 *
 * The gloss is in the key because lemma+pos was not enough: "ihr" is you-plural
 * (unit 12), her-dative (unit 29) and her/their-possessive (unit 13), and the
 * first two are both pronouns. That constraint would have kept ihr and wir out
 * of the deck — which is how the unit teaching the present tense came to have
 * no word for "we".
 */
eq(
  new Set(vocab.map((w) => `${w.lemma}|${w.pos}|${w.en}`)).size,
  vocab.length,
  "no word is taught twice for the same meaning",
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

// ------------------------------------------------- the plan actually shipped

/*
 * Everything above reads the plan. This part reads the database the app serves
 * from, because a plan that never reaches it teaches nobody.
 *
 * data/units-a1-2.json was written by build-a1 on every run and listed in no
 * seeder input. A1.2 came from the generated file instead, which had the old
 * titles and a null grammar_id for every unit — so "Wechselpräpositionen", the
 * unit this course calls its hardest, was seeded as "Wo und wohin" with no rule
 * attached, while a correct file sat unread beside it.
 */
const db = open();
const rows = db
  .prepare(
    `SELECT id, level, ord, title, grammar_id, prereq_json
       FROM unit WHERE level IN ('A1.1','A1.2') ORDER BY level, ord`,
  )
  .all() as {
  id: string;
  level: string;
  ord: number;
  title: string;
  grammar_id: string | null;
  prereq_json: string;
}[];

section("the database teaches the plan, not an older copy of it");
eq(rows.length, 40, "forty A1 units are seeded");
const wrongTitle = rows.filter((r, i) => r.title !== units[i].title);
eq(wrongTitle.length, 0, "every seeded title matches the plan");
if (wrongTitle.length)
  console.log(
    `        e.g. ${wrongTitle[0].id} is "${wrongTitle[0].title}", plan says "${units[rows.indexOf(wrongTitle[0])].title}"`,
  );

const noRule = rows.filter((r, i) => units[i].grammar && !r.grammar_id);
eq(
  noRule.length,
  0,
  "no unit that names a grammar point was seeded without one",
);
if (noRule.length)
  console.log(
    `        ${noRule.map((r) => `${r.id} wants ${units[rows.indexOf(r)].grammar}`).join(", ")}`,
  );

section("the prerequisite chain is unbroken across the level boundary");
/* A1.2 unit 1 with no prerequisite is reachable on day one, and the unit walk
   took it — a learner who had finished nothing was handed the start of A1.2. */
const chain = (i: number) => JSON.parse(rows[i].prereq_json) as string[];
eq(chain(0), [], "the first unit of the course starts free");
const broken = rows
  .slice(1)
  .map((r, i) => ({ r, want: rows[i].id, got: chain(i + 1) }))
  .filter((x) => x.got.length !== 1 || x.got[0] !== x.want);
eq(broken.length, 0, "the other 39 each require the one before them");
if (broken.length)
  console.log(
    `        ${broken.map((b) => `${b.r.id} has ${JSON.stringify(b.got)}, wants ${b.want}`).join("; ")}`,
  );
eq(
  chain(20),
  ["a1-1-u20"],
  "and A1.2 unit 1 requires the last unit of A1.1, not nothing",
);

db.close();
done();
