/**
 * Numbers the README states as fact are facts.
 * needs: seeded database
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ok, eq, section, done, open } from "./harness.mts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const db = open();
const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

/*
 * The README told anyone reading it that the deck was 2,400 words with 36
 * grammar points. It was 2,604 and 46 — numbers that had been true once, which
 * is the exact thing principle 4 forbids, sitting three lines above principle 4.
 *
 * Counted here rather than trusted, so the next import moves the README or
 * fails the suite. Phrases are matched wherever they appear, so a fourth copy
 * of the sentence is covered the day somebody writes it.
 */
/*
 * Anchored to the surrounding words, not to "some number before the word
 * words". The blanket version matched "the 1,175 words in the hand-written
 * half" and "top the deck up to 2,400" — a different, correct number and a
 * target respectively — and a check that cries wolf gets switched off.
 */
const CLAIMS: [string, RegExp, string][] = [
  ["the deck", /the deck is ([\d,]+) words/g, "SELECT COUNT(*) AS n FROM word"],
  [
    "what setup builds",
    /— ([\d,]+) words, ([\d,]+) units, ([\d,]+) grammar points, ([\d,]+) readings, ([\d,]+) levelled/g,
    "SELECT COUNT(*) AS n FROM word",
  ],
  [
    "what costs nothing",
    /needs nothing: ([\d,]+) words/g,
    "SELECT COUNT(*) AS n FROM word",
  ],
  [
    "Wortschatz",
    /\*\*Wortschatz\*\* \| All ([\d,]+) words/g,
    "SELECT COUNT(*) AS n FROM word",
  ],
  [
    "words with audio",
    /([\d,]+) of them with native audio/g,
    "SELECT COUNT(*) AS n FROM word WHERE audio_url IS NOT NULL AND audio_url <> ''",
  ],
  [
    "grammar points",
    /([\d,]+) grammar points/g,
    "SELECT COUNT(*) AS n FROM grammar",
  ],
  [
    "video episodes",
    /([\d,]+) Deutsche Welle video episodes/g,
    "SELECT COUNT(*) AS n FROM video",
  ],
  [
    "prebuilt explanations",
    /\*\*([\d,]+) prebuilt explanations\*\*/g,
    "SELECT COUNT(*) AS n FROM error_pattern",
  ],
];

section("every count the README states as fact matches the database");
for (const [name, re, sql] of CLAIMS) {
  const real = count(sql);
  const found = [...readme.matchAll(re)].map((m) =>
    Number(m[1].replace(/,/g, "")),
  );
  ok(found.length > 0, `${name}: the sentence is still there`, found.length);
  const wrong = found.filter((f) => f !== real);
  eq(
    wrong.length,
    0,
    `${name}: says ${real}${wrong.length ? ` — found ${wrong.join(", ")}` : ""}`,
  );
}

section("the one sentence that lists five counts has all five right");
/* The `data/` line in Get it running. Checked as a group because a reader takes
   it as one statement, and one wrong number in it discredits the other four. */
const setup =
  /— ([\d,]+) words, ([\d,]+) units, ([\d,]+) grammar points, ([\d,]+) readings, ([\d,]+) levelled\s+sentences, ([\d,]+) prebuilt explanations and ([\d,]+) Deutsche Welle/.exec(
    readme,
  );
ok(setup, "the sentence is still in the shape this test knows");
if (setup) {
  const got = setup.slice(1).map((s) => Number(s.replace(/,/g, "")));
  const want = [
    count("SELECT COUNT(*) AS n FROM word"),
    count("SELECT COUNT(*) AS n FROM unit"),
    count("SELECT COUNT(*) AS n FROM grammar"),
    count("SELECT COUNT(*) AS n FROM reading"),
    count("SELECT COUNT(*) AS n FROM sentence"),
    count("SELECT COUNT(*) AS n FROM error_pattern"),
    count("SELECT COUNT(*) AS n FROM video"),
  ];
  eq(got, want, "words, units, grammar, readings, sentences, patterns, videos");
}

section("the course size adds up");
/* Not a README claim — an internal one. 120 units across six half-levels is the
   scope in the spec, and every screen that says "Unit n von 20" depends on it. */
eq(count("SELECT COUNT(*) AS n FROM unit"), 120, "120 units");
for (const lvl of ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2"])
  eq(
    count(`SELECT COUNT(*) AS n FROM unit WHERE level = '${lvl}'`),
    20,
    `${lvl} has twenty`,
  );

db.close();
done();
