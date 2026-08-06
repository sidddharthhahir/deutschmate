/**
 * A2 and B1 units teach the rule their own title names.
 * needs: seeded database
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ok, eq, section, done, open } from "./harness.mts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const db = open();

type Blueprint = {
  level: string;
  ord: number;
  title: string;
  can_do: string[];
  grammar?: string | null;
};
const bps: Blueprint[] = ["blueprints-a2.json", "blueprints-b1.json"].flatMap(
  (f) => JSON.parse(readFileSync(join(ROOT, "data", f), "utf8")) as Blueprint[],
);

section("the blueprints say which rule each unit teaches");
eq(bps.length, 80, "eighty blueprints past A1");
/*
 * build-units.mts used to space a level's grammar points evenly across its
 * twenty units — floor(20 / 6) = every third — which is fair-sounding
 * arithmetic that put every single point on the wrong unit. B1.1 unit 2 is
 * "Höflich bitten · use Konjunktiv II to be polite" and taught no rule at all,
 * while unit 4, about the passive, taught Konjunktiv II.
 */
ok(
  bps.every((b) => "grammar" in b),
  "every one has been given an answer, including null",
);

const known = new Set(
  (db.prepare("SELECT id FROM grammar").all() as { id: string }[]).map(
    (g) => g.id,
  ),
);
const dangling = bps.filter((b) => b.grammar && !known.has(b.grammar));
eq(dangling.length, 0, "no blueprint names a grammar point nobody wrote");
if (dangling.length)
  console.log(
    `        ${dangling.map((d) => `${d.level}/${d.ord} → ${d.grammar}`).join(", ")}`,
  );

section("and the database agrees with them");
/* The blueprint is the plan; the unit row is what a session actually serves.
   data/units-a1-2.json was a correct file nothing read, so agreement between
   the two is the thing worth asserting, not the file on its own. */
const wrong = bps.filter((b) => {
  const row = db
    .prepare("SELECT grammar_id FROM unit WHERE level = ? AND ord = ?")
    .get(b.level, b.ord) as { grammar_id: string | null } | undefined;
  return (row?.grammar_id ?? null) !== (b.grammar ?? null);
});
eq(wrong.length, 0, "every unit row carries what its blueprint asked for");
if (wrong.length)
  console.log(
    `        ${wrong
      .slice(0, 6)
      .map((w) => `${w.level}/${w.ord} wants ${w.grammar}`)
      .join(", ")}`,
  );

section("the rules landed on the units that name them");
/* Spot checks, chosen because the arithmetic got all six of them wrong. */
const expect: [string, number, string][] = [
  ["A2.1", 2, "g-perfekt-sein"], // "use sein in the Perfekt"
  ["A2.1", 8, "g-trennbare"], // "Trennbare Verben"
  ["A2.2", 5, "g-praeteritum"], // "use war and hatte"
  ["B1.1", 2, "g-konjunktiv2"], // "use Konjunktiv II to be polite"
  ["B1.1", 5, "g-infinitiv-zu"], // "Um … zu"
  ["B1.2", 3, "g-nomen-verb"], // "use N-declension nouns"
];
for (const [level, ord, id] of expect) {
  const row = db
    .prepare("SELECT title, grammar_id FROM unit WHERE level = ? AND ord = ?")
    .get(level, ord) as { title: string; grammar_id: string | null };
  eq(row.grammar_id, id, `${level} u${ord} „${row.title}“ teaches ${id}`);
}

section("enough of the course teaches a rule at all");
const taught = (
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM unit WHERE grammar_id IS NOT NULL AND level NOT LIKE 'A1%'",
    )
    .get() as { n: number }
).n;
ok(taught >= 40, "at least forty of the eighty units past A1", taught);
/* A floor, not an equality: a unit about ordering in a restaurant teaches
   vocabulary, and forcing a rule onto it would be padding. */
ok(taught < 80, "and not all of them — thematic units are allowed to exist");

section("the four points written for these levels are reachable");
for (const id of [
  "g-als-wenn",
  "g-plusquamperfekt",
  "g-irreal",
  "g-passiv-modal",
]) {
  const row = db
    .prepare(
      "SELECT title, drills_json, examples_json FROM grammar WHERE id = ?",
    )
    .get(id) as
    { title: string; drills_json: string; examples_json: string } | undefined;
  ok(row, `${id} exists`, row?.title);
  if (!row) continue;
  ok(
    (JSON.parse(row.drills_json) as unknown[]).length >= 3,
    `${id} has drills to practise`,
    (JSON.parse(row.drills_json) as unknown[]).length,
  );
  ok(
    (JSON.parse(row.examples_json) as unknown[]).length >= 3,
    `${id} has examples`,
    (JSON.parse(row.examples_json) as unknown[]).length,
  );
  const used = (
    db
      .prepare("SELECT COUNT(*) AS n FROM unit WHERE grammar_id = ?")
      .get(id) as { n: number }
  ).n;
  ok(used > 0, `${id} is taught by a unit rather than sitting unread`, used);
}

db.close();
done();
