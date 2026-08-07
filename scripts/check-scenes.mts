/**
 * Does an A1 scenario say a word the course has not taught yet?
 *
 *   node scripts/check-scenes.mts
 *
 * The same rule the sentence gate applies to the Tatoeba corpus, applied to the
 * conversations: a scene at unit 6 may use the words of units 1–6 and nothing
 * else. Without this the scenes drift into "every word is common, so it must be
 * beginner material", which is how a relative clause reached day two.
 *
 * Matching is by four-character stem, because German inflects: `komme`,
 * `kommst` and `gekommen` all have to count as `kommen`. That is crude and will
 * wave through a wrong ending — it catches the wrong WORD, not the wrong form,
 * which is the failure that actually matters here. CLOSED is the grammar the
 * course never lists as vocabulary but uses from the first day.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (f: string) =>
  JSON.parse(readFileSync(path.join(ROOT, "data", f), "utf8"));

type Unit = {
  ord: number;
  level: string;
  title: string;
  scenario?: { role: string; goal: string; opener: string } | null;
  dialogue?: { them: string; options: { say: string }[] }[] | null;
};

const { units } = read("curriculum-a1.json") as { units: Unit[] };
const { words } = read("vocab-a1.json") as {
  words: { lemma: string; unit: number }[];
};

/* Articles, pronouns, prepositions and the handful of forms every German
   sentence needs. Listed rather than inferred: a word here is a decision. */
const CLOSED = new Set(
  (
    "der die das den dem des ein eine einen einem einer eines kein keine keinen " +
    "ich du er sie es wir ihr man mich dich sich uns euch mir dir ihm ihnen " +
    "mein meine meinen meinem meiner dein deine deinen unser unsere euer eure " +
    "ist sind bin bist war ware hat habe hast haben hatte wird werden " +
    "und oder aber auch nicht nein ja doch noch schon nur sehr so zu " +
    "in an auf aus bei mit nach von vor um fur uber unter am im zum zur " +
    "wie was wo wer wann warum welche welcher welches wohin woher " +
    "hier dort jetzt dann heute bitte danke ok also mal denn etwas alles"
  ).split(/\s+/),
);

/*
 * Forms a four-character stem cannot reach, because the stem itself changes:
 * sprechen → sprichst, mögen → magst, geben → gibst. Mapped to their lemma so
 * the check still refuses a word the unit has not taught — putting these in
 * CLOSED instead would let `kann` through at unit 24, three units before
 * können is taught, which is one of the leaks this found.
 */
const IRREGULAR: Record<string, string> = {
  kann: "können",
  kannst: "können",
  könnt: "können",
  darf: "dürfen",
  darfst: "dürfen",
  mag: "mögen",
  magst: "mögen",
  will: "wollen",
  willst: "wollen",
  muss: "müssen",
  musst: "müssen",
  soll: "sollen",
  sollst: "sollen",
  gibt: "geben",
  gibst: "geben",
  spricht: "sprechen",
  sprichst: "sprechen",
  fährt: "fahren",
  fährst: "fahren",
  liest: "lesen",
  lies: "lesen",
  isst: "essen",
  esst: "essen",
  lest: "lesen",
  nimmt: "nehmen",
  nimm: "nehmen",
  sieht: "sehen",
  sehe: "sehen",
  hilft: "helfen",
  hilf: "helfen",
  fängt: "anfangen",
  fängst: "anfangen",
  steigst: "umsteigen",
  steigt: "umsteigen",
  sei: "sein",
  warst: "sein",
  war: "sein",
  weh: "wehtun",
  tut: "wehtun",
  gibts: "geben",
  hilfe: "helfen",
  wem: "wer",
  /* Separable verbs split, and the checker sees only the halves. */
  stehe: "aufstehen",
  stehst: "aufstehen",
  rufe: "anrufen",
};

/*
 * The proper nouns the scenes use. Listed, not inferred from capitalisation:
 * every German noun is capitalised, so "looks like a name" would wave through
 * exactly the untaught vocabulary this check exists to catch. Adding a name
 * here is a decision — adding a common noun here is cheating.
 */
const NAMES = new Set(
  "Mira Jan Anna Tom Lena Max Sarah Weber Dr Indien Berlin Köln Hannover Deutschland München Hamburg Frankfurt Wien Euro".split(
    /\s+/,
  ),
);

const stem = (w: string) =>
  w
    .toLowerCase()
    .replace(/[.,!?;:„""»«…—-]/g, "")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .slice(0, 4);

let problems = 0;
for (const u of units) {
  if (!u.scenario) {
    console.log(`  ${u.level} u${u.ord} ${u.title}: NO SCENARIO`);
    problems++;
    continue;
  }
  /* Three characters as well as four: `rot` and `rote` are the same word, and
     a four-character stem makes them different. */
  const allowed = new Set<string>();
  for (const w of words)
    if (w.unit <= u.ord)
      for (const part of w.lemma.split(/\s+/)) {
        allowed.add(stem(part));
        allowed.add(stem(part).slice(0, 3));
      }

  const lines = [
    u.scenario.opener,
    ...(u.dialogue ?? []).flatMap((t) => [
      t.them,
      ...t.options.map((o) => o.say),
    ]),
  ];
  const unknown = new Set<string>();
  for (const line of lines)
    for (const raw of line.split(/\s+/)) {
      const bare = raw.replace(/[.,!?;:„""»«…]/g, "");
      if (!bare || NAMES.has(bare)) continue;
      const low = bare.toLowerCase();
      const literal = stem(bare);
      if (!literal || CLOSED.has(literal) || CLOSED.has(low)) continue;
      /* The literal form first: `gibt` is the taught lemma `es gibt` at unit
         28, and resolving it to `geben` — unit 29 — would fail it a unit early. */
      if (allowed.has(literal) || allowed.has(literal.slice(0, 3))) continue;
      const s = stem(IRREGULAR[low] ?? bare);
      if (allowed.has(s) || allowed.has(s.slice(0, 3))) continue;
      unknown.add(bare);
    }
  if (unknown.size) {
    problems++;
    console.log(
      `  ${u.level} u${u.ord} ${u.title}: ${[...unknown].join(", ")}`,
    );
  }
}

console.log(
  problems
    ? `\n  ${problems} unit(s) to look at\n`
    : "\n  every A1 scenario stays inside the vocabulary its unit has taught\n",
);
/* Non-zero so the test suite can run this as-is rather than reimplementing it,
   and so a scene that drifts fails the build instead of printing into a log. */
if (problems) process.exitCode = 1;
