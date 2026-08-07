/**
 * Every block says what it is, and none of them can blank the screen.
 * needs: seeded database
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ok, eq, section, done, open } from "./harness.mts";
import { INTRO, introKey } from "../src/lib/block-intro.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

section("every block the runner can render says what it is");
/*
 * Read from the runner's own switch rather than from a list kept here, so a
 * fifteenth block kind cannot be added with no explanation attached. Reported
 * from real use: "I have clicked ▶ Heutige Sitzung and I literally don't
 * understand what is happening."
 */
const runner = readFileSync(join(ROOT, "src/app/session/page.tsx"), "utf8");
const kinds = [...runner.matchAll(/case "([a-z-]+)":/g)].map((m) => m[1]);
ok(
  kinds.length >= 12,
  "the switch was found and parsed",
  `${kinds.length} kinds`,
);

const undocumented = kinds.filter((k) => !INTRO[k]);
eq(undocumented.length, 0, "no block kind is missing its intro");
if (undocumented.length) console.log(`        ${undocumented.join(", ")}`);

section("the intro copy is usable, not a placeholder");
for (const [key, intro] of Object.entries(INTRO)) {
  ok(
    intro.line.length > 12 && intro.line.length <= 60,
    `${key}: the standing one-liner fits a header`,
    `${intro.line.length} chars`,
  );
  ok(
    intro.body.length >= 1 && intro.body.length <= 3,
    `${key}: 1–3 paragraphs`,
  );
  ok(
    intro.body.every((p) => p.length > 40),
    `${key}: no paragraph is a stub`,
  );
}

section("nothing tells a phone to press a key it does not have");
/*
 * Every control in the session is a real button, so touch always worked — but
 * the labels named shortcuts, and the tour opened with "Press Enter", which on
 * a phone is the one sentence defining the product naming a key that is not
 * there. Inline hints are swapped in CSS (`.kbd-hint` / `.touch-hint`); these
 * strings are the ones no stylesheet can reach.
 */
const KEYBOARD =
  /\b(Leertaste|Enter|Esc|Alt ?\+|Cmd|Ctrl|number row|1 ?[–-] ?4|1 2 3 4|keypress|press [A-Z]\b)/;
for (const [key, intro] of Object.entries(INTRO)) {
  const prose = [intro.line, ...intro.body].join(" ");
  ok(
    !KEYBOARD.test(prose),
    `${key}: the line and body name no key`,
    KEYBOARD.exec(prose)?.[0] ?? "",
  );
  /* The legend may name keys — that is its job — but only if there is a touch
     list beside it saying what to tap instead. */
  if (intro.keys)
    ok(
      Array.isArray(intro.touchKeys) && intro.touchKeys.length > 0,
      `${key}: its key legend has a touch counterpart`,
      `${intro.keys.length} keys, ${intro.touchKeys?.length ?? 0} taps`,
    );
  for (const [label] of intro.touchKeys ?? [])
    ok(
      !KEYBOARD.test(label),
      `${key}: the touch legend names a control, not a key`,
      label,
    );
}

section("the audio review day gets its own words");
/* The same intro for both would promise "you see a word" on the screen whose
   whole point is that the word is hidden. */
eq(introKey("review", { audioFirst: true }), "review-audio", "audio day");
eq(introKey("review", { audioFirst: false }), "review", "ordinary day");
eq(introKey("review", undefined), "review", "and a payload with nothing on it");
ok(
  INTRO["review"].line !== INTRO["review-audio"].line,
  "and the two say different things",
);

// ------------------------------------------------------ the null scenario

const db = open();

section("a unit with no scenario stores nothing, not the word „null“");
/*
 * JSON.stringify(null) is the four characters "null", which is truthy. The
 * seeder wrote it, session.ts read it as "there is a scenario here", pushed a
 * Gespräch block, and ConversationBlock read .role off the parsed null. That is
 * a white screen at block five or six of every single A1 session — before the
 * recap, which is the screen that saves the session.
 */
const literal = (
  db
    .prepare("SELECT COUNT(*) AS n FROM unit WHERE scenario_json = 'null'")
    .get() as {
    n: number;
  }
).n;
eq(literal, 0, "no unit stores the string „null“ as its scenario");

const dialogueNull = (
  db
    .prepare("SELECT COUNT(*) AS n FROM unit WHERE dialogue_json = 'null'")
    .get() as {
    n: number;
  }
).n;
eq(dialogueNull, 0, "nor as its dialogue");

section("every scenario the session would serve is actually usable");
const withScenario = db
  .prepare(
    "SELECT id, title, scenario_json FROM unit WHERE scenario_json IS NOT NULL AND scenario_json <> ''",
  )
  .all() as { id: string; title: string; scenario_json: string }[];
ok(withScenario.length > 0, "some units do have one", withScenario.length);

const broken = withScenario.filter((u) => {
  try {
    const s = JSON.parse(u.scenario_json) as { role?: string; opener?: string };
    return !s || typeof s !== "object" || !s.role;
  } catch {
    return true;
  }
});
eq(broken.length, 0, "each one parses to an object with a role");
if (broken.length) console.log(`        ${broken.map((b) => b.id).join(", ")}`);

section("A1 can hold a conversation from day one");
/* This assertion used to read the other way — 40 units with no scenario, on the
   grounds that no Gespräch is more honest than a broken one. They are written
   now, so the honest assertion is that every one of them is there. */
const a1None = (
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM unit WHERE level IN ('A1.1','A1.2') AND scenario_json IS NULL",
    )
    .get() as { n: number }
).n;
eq(a1None, 0, "no A1 unit is left without a scenario");

/* A1 is the level most likely to be studied on a train with no signal, and the
   only one where every unit ships a scripted fallback. Losing that would fail
   quietly: the block still renders, and just stops working without a network. */
const a1NoDialogue = (
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM unit WHERE level IN ('A1.1','A1.2') AND (dialogue_json IS NULL OR dialogue_json = '')",
    )
    .get() as { n: number }
).n;
eq(a1NoDialogue, 0, "and every one can be played offline");

db.close();
done();
