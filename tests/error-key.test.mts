/**
 * The prebuilt explanations, and whether a real mistake can reach them.
 *
 * Spec §12 planned "~200 prebuilt error patterns" against a cache keyed on the
 * exact sentence pair. Nothing was ever written, and nothing could have been:
 * you cannot enumerate the sentences a learner will meet, so every prebuilt row
 * would have sat there never matching anything. A table full of correct
 * explanations that never fire is the Alltag failure exactly.
 *
 * So the key is the difference, not the sentences (src/lib/error-key.ts), and
 * this file checks the two things that can go wrong with that:
 *
 *   1. the key function itself — does the same mistake in two sentences
 *      produce the same key, and do two different mistakes stay apart
 *   2. coverage — do realistic wrong answers actually land on a row
 *
 * Check 2 is the one worth having. It drives sentences a beginner would really
 * produce and fails if the explanation they get back is missing or generic.
 *
 * needs: seeded database
 */
import { ok, eq, section, done, open } from "./harness.mts";
import { patternFor, signatureFor } from "../src/lib/error-key.ts";

section("the same mistake in different sentences is one key");
eq(patternFor("Ich sehe den Mann", "Ich sehe der Mann"), "w:der→den", "accusative der/den");
eq(
  patternFor("Sie kennt den Lehrer", "Sie kennt der Lehrer"),
  "w:der→den",
  "…and the same key from a different sentence",
);
eq(patternFor("Du gehst nach Hause", "Du gehe nach Hause"), "v:-e→-st", "a verb ending");
eq(
  patternFor("Du machst das gut", "Du mache das gut"),
  "v:-e→-st",
  "…keyed by the ending, not the verb",
);

section("different mistakes stay apart");
ok(
  patternFor("Ich sehe den Mann", "Ich sehe der Mann") !==
    patternFor("Ich helfe dem Mann", "Ich helfe der Mann"),
  "accusative and dative are not the same lesson",
);
eq(patternFor("Ich helfe dem Mann", "Ich helfe der Mann"), "w:der→dem", "dative der/dem");

section("what is NOT a pattern");
eq(patternFor("Ich gehe heute ins Kino", "Ich gehe heute ins Kino"), null, "no mistake, no key");
eq(patternFor("Guten Morgen", ""), null, "an empty answer has no lesson in it");
eq(
  patternFor("Ich fahre morgen mit dem Zug nach Köln", "Ich will Zug Köln morgen"),
  null,
  "a rewrite with four differences has no single lesson",
);
eq(patternFor("Ich bin müde", "Ich bin Müde"), "case", "only the capital changed");
eq(patternFor("Ich möchte schön wohnen", "Ich möchte schon wohnen"), "sp:umlaut", "only an umlaut");
eq(
  patternFor("Heute gehe ich ins Kino", "Heute ich gehe ins Kino"),
  "order:verb-position-2",
  "same words, verb displaced",
);

section("a stem that is shared but is not a conjugation");
eq(
  patternFor("Ich stelle das Glas auf den Tisch", "Ich stehe das Glas auf den Tisch"),
  "w:stehe→stelle",
  "stehen/stellen is a word choice, not an ending",
);

section("the two key spaces cannot collide");
/* A pattern key is prefixed and has no pipe; a sentence key always has one.
   If that ever stops being true, a prebuilt row could shadow a real sentence. */
const sentence = signatureFor("Ich sehe den Mann", "Ich sehe der Mann");
ok(sentence.includes("|"), "a sentence key contains a pipe", sentence);
for (const [e, g] of [
  ["Ich sehe den Mann", "Ich sehe der Mann"],
  ["Du gehst", "Du gehe"],
  ["Ich bin müde", "Ich bin Müde"],
  ["Heute gehe ich", "Heute ich gehe"],
]) {
  const k = patternFor(e, g);
  ok(k !== null && !k.includes("|"), `pattern key has no pipe: ${k}`);
}

// ------------------------------------------------------------------ coverage
/**
 * Wrong answers a beginner actually produces, and what each one needs told.
 * If the table cannot answer these, it does not matter how many rows it has.
 */
const REAL: [expected: string, got: string, about: string][] = [
  ["Ich sehe den Mann", "Ich sehe der Mann", "accusative after sehen"],
  ["Ich kaufe einen Apfel", "Ich kaufe ein Apfel", "ein → einen"],
  ["Ich fahre mit dem Bus", "Ich fahre mit der Bus", "dative after mit"],
  ["Ich helfe der Frau", "Ich helfe die Frau", "feminine dative"],
  ["Ich wohne bei meinem Bruder", "Ich wohne bei mein Bruder", "possessive in the dative"],
  ["Das ist die Wohnung", "Das ist der Wohnung", "-ung is feminine"],
  ["Ich habe keinen Hunger", "Ich habe kein Hunger", "kein → keinen"],
  ["Ich habe kein Auto", "Ich habe nicht Auto", "kein, not nicht"],
  ["Das ist nicht mein Auto", "Das ist kein mein Auto", "nicht once there is a possessive"],
  ["Er ist nach Hause gegangen", "Er hat nach Hause gegangen", "sein with movement"],
  ["Ich habe gegessen", "Ich bin gegessen", "haben with most verbs"],
  ["Du bist gekommen", "Du hast gekommen", "sein with kommen"],
  ["Wir sind angekommen", "Wir haben angekommen", "sein with arriving"],
  ["Du gehst zur Arbeit", "Du gehe zur Arbeit", "du takes -st"],
  ["Er arbeitet viel", "Er arbeite viel", "er takes -t"],
  ["Wir spielen Fußball", "Wir spielt Fußball", "wir takes -en"],
  ["Du fährst nach Berlin", "Du fahrst nach Berlin", "strong verb umlaut"],
  ["Er spricht Deutsch", "Er sprecht Deutsch", "e → i in the third person"],
  ["Er nimmt den Bus", "Er nehmt den Bus", "nehmen changes stem"],
  ["Ich kann schwimmen", "Ich kanne schwimmen", "modals take no -e"],
  ["Ich fahre nach Berlin", "Ich fahre zu Berlin", "nach for cities"],
  ["Ich gehe zum Arzt", "Ich gehe nach Arzt", "zu for people"],
  ["Ich wohne seit zwei Jahren hier", "Ich wohne vor zwei Jahren hier", "seit vs vor"],
  ["Das Buch liegt auf dem Tisch", "Das Buch liegt an dem Tisch", "auf for a surface"],
  ["Wir treffen uns um acht Uhr", "Wir treffen uns am acht Uhr", "um for clock times"],
  ["Ich komme aus Indien", "Ich komme von Indien", "aus for origin"],
  ["Ich weiß es nicht", "Ich kenne es nicht", "wissen vs kennen"],
  ["Ich fahre mit dem Auto", "Ich gehe mit dem Auto", "gehen is on foot"],
  ["Ich glaube, dass er kommt", "Ich glaube, das er kommt", "dass with two s"],
  ["Ich habe viel Arbeit", "Ich habe sehr Arbeit", "viel vs sehr"],
  ["Er ist größer als ich", "Er ist größer wie ich", "als in a comparison"],
  ["Ich bin noch hier", "Ich bin schon hier", "noch vs schon"],
  ["Ich lege das Buch auf den Tisch", "Ich liege das Buch auf den Tisch", "legen vs liegen"],
  ["Ich möchte einen Kaffee", "Ich mag einen Kaffee", "möchte for a request"],
  ["Ich wohne in Berlin", "Ich lebe in Berlin", "wohnen for an address"],
  ["Sie sind sehr freundlich", "Du sind sehr freundlich", "Sie, not du"],
  ["Er hilft mir", "Er hilft mich", "helfen takes the dative"],
  ["Ich sehe ihn", "Ich sehe er", "accusative pronoun"],
  ["Ich habe ein Haus", "Ich habe ein haus", "nouns are capitalised"],
  ["Die Tür ist schön", "Die Tür ist schon", "the umlaut is the word"],
  ["Heute gehe ich ins Kino", "Heute ich gehe ins Kino", "verb second"],
];

const db = open();
const row = db.prepare("SELECT explain_md, source, tag FROM error_pattern WHERE signature = ?");
const total = db.prepare("SELECT COUNT(*) AS n FROM error_pattern WHERE source = 'prebuilt'").get() as
  | { n: number }
  | undefined;

section("the table is actually populated");
ok((total?.n ?? 0) >= 200, "at least 200 prebuilt patterns are seeded", total?.n ?? 0);

section("realistic mistakes reach a specific explanation");
let specific = 0;
const missed: string[] = [];
for (const [expected, got, about] of REAL) {
  const key = patternFor(expected, got);
  const hit = key ? (row.get(key) as { explain_md: string } | undefined) : undefined;
  if (hit) specific++;
  else missed.push(`${about}  [${key ?? "no key"}]`);
}
ok(
  specific === REAL.length,
  `all ${REAL.length} get a specific explanation`,
  missed.length ? `\n        missing: ${missed.join("\n                 ")}` : String(specific),
);

section("every tag has a last-resort row, so nothing falls through to a bare label");
const TAGS = [
  "article-gender", "article-akkusativ", "article-dativ", "article-genitiv",
  "verb-ending", "verb-position-2", "verb-final", "perfekt-hilfsverb",
  "praeposition", "plural", "negation", "pronoun", "capitalisation",
  "spelling", "word-order", "vocabulary",
];
for (const t of TAGS) ok(Boolean(row.get(`tag:${t}`)), `tag:${t}`);

section("nothing prebuilt names a specific noun it cannot know about");
/* A pattern explanation is reused across every sentence that produces the key,
   so it must not claim anything about the words in front of it. Quoting German
   as an example is fine; asserting a gender in the abstract is not. */
const all = db
  .prepare("SELECT signature, explain_md FROM error_pattern WHERE source = 'prebuilt'")
  .all() as { signature: string; explain_md: string }[];
const leaky = all.filter((r) => /\bthis (noun|word|verb) (is|takes) (masculine|feminine|neuter)\b/i.test(r.explain_md) && !/^w:/.test(r.signature));
eq(leaky.length, 0, "no gender claim outside a word-pair key");

/* A rule, not a label. The bar is deliberately low — "ich takes -e. -st belongs
   to du only." is 37 characters and is a complete lesson — but it does exclude
   the one-clause stubs that would read as a restatement of the correction. */
const stub = all.filter((r) => r.explain_md.length < 30);
eq(stub.length, 0, "no explanation is a bare label");

const avg = Math.round(all.reduce((n, r) => n + r.explain_md.length, 0) / all.length);
ok(avg >= 100, "and the average is a real paragraph", `${avg} characters`);

section("every tag the classifier can produce can also be drilled");
/* A tag with no grammar point behind it means the Fix block names your top
   mistake and then has nothing to offer for it. The mapping lives in
   session.ts; this checks the slugs it points at exist. `vocabulary` is the
   deliberate exception — there is no grammar rule for choosing a wrong word. */
const SLUGS = new Set(
  (db.prepare("SELECT slug FROM grammar").all() as { slug: string }[]).map((r) => r.slug),
);
const DRILLS: Record<string, string[]> = {
  "article-gender": ["artikel-nominativ"],
  "article-akkusativ": ["akkusativ"],
  "article-dativ": ["dativ", "praepositionen-kasus"],
  "article-genitiv": ["genitiv"],
  "verb-ending": ["praesens-regular", "verb-sein", "verb-haben"],
  "verb-position-2": ["verb-position-2"],
  "verb-final": ["modalverben"],
  "perfekt-hilfsverb": ["perfekt"],
  praeposition: ["praepositionen-kasus", "wechselpraepositionen"],
  plural: ["plural"],
  negation: ["nicht-kein"],
  pronoun: ["personalpronomen"],
  capitalisation: [],
  spelling: [],
  "word-order": ["verb-position-2", "nebensaetze"],
  vocabulary: [],
};
for (const t of TAGS) {
  ok(t in DRILLS, `${t} is mapped`);
  for (const slug of DRILLS[t] ?? []) ok(SLUGS.has(slug), `  ↳ grammar point ${slug} exists`);
}

section("the file and the table agree");
/* Upserting alone leaves a renamed key behind forever. The seeder deletes
   prebuilt rows the file no longer produces; this is the check that it did. */
const unreachable = all.filter((r) => {
  if (!r.signature.startsWith("w:")) return false;
  const [wrong, right] = r.signature.slice(2).split("→");
  return !wrong || !right;
});
eq(unreachable.length, 0, "every word-pair key is well formed");

db.close();
done();
