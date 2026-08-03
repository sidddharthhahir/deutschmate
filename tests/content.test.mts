/**
 * The content itself, before anything runs on it.
 *
 * A word that belongs to no unit is never taught; a unit pointing at a word
 * that does not exist renders a blank card. Neither shows up as an error
 * anywhere — the session just quietly skips it — so it has to be checked here.
 *
 * needs: seeded database
 */
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { open, ok, section, done } from "./harness.mts";

const db = open();

const units = db
  .prepare("SELECT id, level, ord, word_ids_json, grammar_id FROM unit ORDER BY level, ord")
  .all() as { id: string; level: string; ord: number; word_ids_json: string; grammar_id: string | null }[];
const words = db.prepare("SELECT id, lemma, article, pos, en, level FROM word").all() as {
  id: string; lemma: string; article: string | null; pos: string; en: string; level: string;
}[];

section("shape");
ok(units.length === 120, "120 units", units.length);
ok(words.length > 2000, "the deck is B1-sized", `${words.length} words`);

section("every word is reachable, every reference resolves");
const wordIds = new Set(words.map((w) => w.id));
const inUnits = units.flatMap((u) => JSON.parse(u.word_ids_json) as string[]);
const inUnitsSet = new Set(inUnits);

const orphans = words.filter((w) => !inUnitsSet.has(w.id));
ok(orphans.length === 0, "no word belongs to no unit",
  orphans.length ? orphans.slice(0, 5).map((w) => w.lemma).join(", ") : "");

const dangling = [...inUnitsSet].filter((id) => !wordIds.has(id));
ok(dangling.length === 0, "no unit points at a missing word",
  dangling.slice(0, 5).join(", "));

ok(inUnits.length === inUnitsSet.size, "no word is taught by two units",
  `${inUnits.length - inUnitsSet.size} repeated`);

const grammarIds = new Set(
  (db.prepare("SELECT id FROM grammar").all() as { id: string }[]).map((g) => g.id),
);
const badGrammar = units.filter((u) => u.grammar_id && !grammarIds.has(u.grammar_id));
ok(badGrammar.length === 0, "no unit points at a missing grammar point",
  badGrammar.map((u) => u.id).join(", "));

section("no unit is too big to finish");
/* A session introduces at most twelve words. A unit larger than that carries
   over to the next day, which is fine — but past about thirty it stops feeling
   like a unit and the reading and scenario go stale sitting there. */
const sizes = units.map((u) => (JSON.parse(u.word_ids_json) as string[]).length).sort((a, b) => a - b);
ok(sizes[0] >= 5, "the smallest unit still teaches something", `${sizes[0]} words`);
ok(sizes.at(-1)! <= 32, "the largest unit is at most three days of vocabulary", `${sizes.at(-1)} words`);

section("every card can be shown");
const noGloss = words.filter((w) => !w.en?.trim());
ok(noGloss.length === 0, "every word has an English meaning", noGloss.length);

const nounsNoArticle = words.filter((w) => w.pos === "noun" && !w.article);
ok(nounsNoArticle.length === 0, "every noun has der/die/das",
  nounsNoArticle.slice(0, 5).map((w) => w.lemma).join(", "));

const badArticle = words.filter((w) => w.article && !["der", "die", "das"].includes(w.article));
ok(badArticle.length === 0, "and it is one of the three", badArticle.length);

const LEVELS = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2"];
const badLevel = words.filter((w) => !LEVELS.includes(w.level));
ok(badLevel.length === 0, "every word sits at a real level", badLevel.length);

section("examples");
/* Without an example a word cannot be clozed, cannot appear in the sentence
   builder and cannot be drilled from Problemwörter — see attach-examples.mts. */
const withExample = (
  db.prepare("SELECT COUNT(*) n FROM word WHERE example_de IS NOT NULL AND example_de <> ''").get() as { n: number }
).n;
const pct = Math.round((withExample / words.length) * 100);
ok(pct >= 95, "at least 95% of words have an example sentence",
  `${withExample}/${words.length} (${pct}%)`);

section("audio");
/* The .ogg files ship with the repo but `audio_url` is set by seeding, not by
   the download. When seeding did not link them, a fresh clone had every
   recording on disk and no way to play any of them. */
const AUDIO_DIR = path.join(process.cwd(), "public/audio/words");
if (existsSync(AUDIO_DIR)) {
  const onDisk = new Set(
    readdirSync(AUDIO_DIR).filter((f) => f.endsWith(".ogg")).map((f) => f.slice(0, -4)),
  );
  const linked = db.prepare(
    "SELECT id, audio_url FROM word WHERE audio_url IS NOT NULL AND audio_url <> ''",
  ).all() as { id: string; audio_url: string }[];
  const linkedIds = new Set(linked.map((w) => w.id));

  /* Recordings for words the deck no longer teaches are kept deliberately.
     Commons rate-limits hard — the last full fetch was throttled 114 times —
     so a file already on disk is worth more than the few kilobytes it costs if
     the word ever comes back. They are ignored here rather than flagged. */
  const unlinked = [...onDisk].filter((id) => wordIds.has(id) && !linkedIds.has(id));
  ok(unlinked.length === 0, "every recording whose word is still taught is linked",
    unlinked.slice(0, 5).join(", "));

  const missingFile = linked.filter((w) => !onDisk.has(w.id));
  ok(missingFile.length === 0, "no word points at a recording that is not there",
    missingFile.slice(0, 5).map((w) => w.id).join(", "));

  ok(linked.every((w) => w.audio_url === `/audio/words/${w.id}.ogg`),
    "and every link uses the served path", `${linked.length} recordings`);
} else {
  console.log("SKIP  public/audio/words is absent");
}

section("progression is possible");
/* The learner is promoted at the end of a level, so a level with no units is a
   dead end the walk in progression.test.mts would only find after 300 loops. */
for (const lv of LEVELS) {
  const n = units.filter((u) => u.level === lv).length;
  ok(n > 0, `${lv} has units`, n);
}

db.close();
done();
