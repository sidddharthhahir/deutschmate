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

const after: [string, string][] = [
  ["akkusativ", "gender-nominativ"],
  ["dativ", "akkusativ"],
  ["wechselpraepositionen", "dativ"],
  ["praesens-regular", "sein-haben"],
  ["perfekt-haben", "praesens-regular"],
  ["perfekt-sein", "perfekt-haben"],
  ["trennbare-verben", "modalverben"],
  ["possessiv-voll", "dativ"],
];
for (const [later, earlier] of after) {
  const l = at.get(later);
  const e = at.get(earlier);
  ok(
    l !== undefined && e !== undefined && l > e,
    `${later} comes after ${earlier}`,
    `${e} → ${l}`,
  );
}

section("the foundation this course was missing arrives early");
/* Reported from real use: "we should introduce alphabet, number, time reading
   and all — der die das — this is the base right?" It was not there at all. */
for (const [what, by] of [
  ["alphabet-spelling", 5],
  ["gender-nominativ", 8],
  ["uhrzeit", 12],
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
eq(
  at.get("wechselpraepositionen"),
  39,
  "two-way prepositions at 39, not earlier",
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

done();
