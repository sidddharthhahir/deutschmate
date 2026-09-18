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

section("twelve units, numbered and named");
/*
 * A1.1 only for now (2026-09) — A1.2 through B1.2 are deliberately unseeded
 * while the Momente rewrite gets solid (see data/deferred/README.md), and
 * data/curriculum-a1.json was trimmed to match what's actually shipped
 * (the full A1.1+A1.2 plan is snapshotted at data/deferred/curriculum-a1-full.json).
 * This was 32 (12 A1.1 + 20 A1.2) before that trim.
 */
eq(units.length, 12, "all of A1.1");
eq(units.filter((u) => u.level === "A1.1").length, 12, "twelve in A1.1");
ok(
  units.every((u, i) => u.ord === i + 1),
  "ord runs 1..12 with no gap",
);
eq(new Set(units.map((u) => u.id)).size, 12, "no two units share an id");
eq(new Set(units.map((u) => u.title)).size, 12, "no two share a title");

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
 * A1.1-internal dependencies only for now — the A1.2 ones (dative, two-way
 * prepositions, es gibt, clock time) named an id nothing in the shipped
 * course teaches once A1.2 was unseeded (see the top-of-file note), and a
 * pair that can never be satisfied is not a useful thing to keep listing.
 * The ids are A1.1's own (g-akkusativ-a11, not the A1.2/A2.1 g-akkusativ) —
 * see the "reused rather than duplicated" note further down for why two ids
 * exist for the same concept at all.
 */
const after: [string, string][] = [
  ["g-praesens", "g-sein"],
  ["g-negation", "g-praesens"],
  ["g-akkusativ-a11", "g-articles-nom"],
  ["g-wordorder", "g-praesens"],
  ["g-perfekt-haben-a11", "g-praesens"],
  ["g-perfekt-sein-a11", "g-perfekt-haben-a11"],
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
/*
 * Reported from real use: "we should introduce alphabet, number, time reading
 * and all — der die das — this is the base right?" It was not there at all.
 * Momente doesn't teach the alphabet or clock-reading as their own grammar
 * points — they're folded into Lektion 1's content and Lektion 8's vocabulary
 * respectively, not separate rules — so those two checks no longer apply.
 * der/die/das still has to arrive early, and does.
 */
for (const [what, by] of [["g-articles-nom", 8]] as [string, number][]) {
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

section("the hardest thing in A1.1 is last");
/*
 * Was about two-way prepositions (g-wechselpraep), the hardest thing in the
 * full A1 course — an A1.2 point, out of reach while A1.2 is unseeded. Within
 * A1.1 alone the Perfekt (units 11-12, building on every verb taught before
 * it) is what the course spends its last two days on, not consolidation —
 * see data/deferred/curriculum-a1-full.json for the full-course version of
 * this claim once A1.2 is back.
 */
eq(at.get("g-perfekt-sein-a11"), 12, "Perfekt mit sein at 12, the last unit");

section("every grammar point A1.1 names actually exists");
/* The plan was drafted with working names and several of those points were
   already written under a g- id. A unit pointing at a name nobody wrote teaches
   vocabulary and no rule, silently — so A1.1, which is finished, must be whole. */
/* grammar-a2.json is deferred along with A1.2 (see the top-of-file note) —
   A1.1's own 12 units never pointed at anything defined there in the first
   place, only A1.2's since-unseeded units did. */
const realIds = new Set(
  (
    JSON.parse(
      readFileSync(join(ROOT, "data/grammar-a1.json"), "utf8"),
    ) as { id: string }[]
  ).map((g) => g.id),
);
const dangling = units
  .filter((u) => u.grammar && !realIds.has(u.grammar))
  .map((u) => `${u.ord}:${u.grammar}`);
ok(
  dangling.length === 0,
  "no unit points at a grammar point that was never written",
  dangling.join(", ") || "all 12 present",
);

section("the deck it implies is the right size");
/*
 * Was 350-560, sized against the full 32-unit A1 plan. A1.1 alone declares
 * 175 words (matches data/vocab-a1.json's own count) — a floor with headroom
 * below it and a ceiling with headroom above, same style as before, just
 * rescaled to the 12 units actually shipping.
 */
const words = units.reduce((n, u) => n + u.words, 0);
ok(
  words >= 150 && words <= 250,
  "roughly the vocabulary Momente's pace implies",
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
  (n) =>
    ![
      "deutschland",
      "oesterreich",
      "die-schweiz",
      "englisch",
      "fleisch",
      "wasser",
    ].includes(n.id),
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
       FROM unit WHERE level = 'A1.1' ORDER BY ord`,
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
eq(rows.length, 12, "twelve A1.1 units are seeded");
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

section("the prerequisite chain is unbroken");
/*
 * Was "...across the level boundary" — checked A1.2 unit 1's prereq pointed
 * at A1.1's last unit rather than nothing. With A1.2 unseeded there is no
 * boundary to cross right now; this keeps the within-A1.1 half of that check.
 */
const chain = (i: number) => JSON.parse(rows[i].prereq_json) as string[];
eq(chain(0), [], "the first unit of the course starts free");
const broken = rows
  .slice(1)
  .map((r, i) => ({ r, want: rows[i].id, got: chain(i + 1) }))
  .filter((x) => x.got.length !== 1 || x.got[0] !== x.want);
eq(broken.length, 0, "the other 11 each require the one before them");
if (broken.length)
  console.log(
    `        ${broken.map((b) => `${b.r.id} has ${JSON.stringify(b.got)}, wants ${b.want}`).join("; ")}`,
  );

db.close();
done();
