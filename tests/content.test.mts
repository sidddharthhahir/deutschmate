/**
 * The content itself, before anything runs on it. A word that belongs to no unit is never taught;
 * a unit pointing at a word that does not exist renders a blank card.
 * needs: seeded database
 */
import { readdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { open, ok, section, done } from "./harness.mts";

const db = open();

const units = db
  .prepare(
    "SELECT id, level, ord, word_ids_json, grammar_id FROM unit ORDER BY level, ord",
  )
  .all() as {
  id: string;
  level: string;
  ord: number;
  word_ids_json: string;
  grammar_id: string | null;
}[];
const words = db
  .prepare("SELECT id, lemma, article, pos, en, level FROM word")
  .all() as {
  id: string;
  lemma: string;
  article: string | null;
  pos: string;
  en: string;
  level: string;
}[];

section("shape");
ok(units.length === 120, "120 units", units.length);
ok(words.length > 2000, "the deck is B1-sized", `${words.length} words`);

section("every word is reachable, every reference resolves");
const wordIds = new Set(words.map((w) => w.id));
const inUnits = units.flatMap((u) => JSON.parse(u.word_ids_json) as string[]);
const inUnitsSet = new Set(inUnits);

/*
 * Two decks, on purpose, and this used to be one rule for both.
 *
 * The COURSE is what the daily session teaches: every word in a designed unit,
 * every unit with a can-do statement that describes it. The BROWSE deck is the
 * rest — 2,000-odd words padded in from a subtitle frequency list, useful in
 * Wortschatz and to /text, and never introduced as new vocabulary.
 *
 * Requiring every word to belong to a unit is what forced the padding into
 * units in the first place, which is how "Leiche" ended up in a unit whose
 * can-do said "name people around you". So: a taught word must be taught by a
 * unit, and an untaught word must be reachable to browse — but not taught.
 */
const taught = words.filter((w) => inUnitsSet.has(w.id));
const browseOnly = words.filter((w) => !inUnitsSet.has(w.id));
ok(
  taught.length >= 400,
  "the course teaches a real vocabulary",
  `${taught.length} words`,
);
ok(
  browseOnly.length > 0,
  "and the rest stays browsable rather than being padded into units",
  `${browseOnly.length} words`,
);
/*
 * Keyed on the PLAN, not on the level. Plenty of words still carry level A1.1
 * from the old frequency import — ein, dass, so, wenn — and those are browse
 * words now, which is the point. What must hold is that everything the plan
 * says to teach is actually taught; if one is missing, build-a1 and the seeder
 * have disagreed and a learner would never meet it.
 */
const planned = new Set(
  (
    JSON.parse(
      readFileSync(path.join(process.cwd(), "data/vocab-a1.json"), "utf8"),
    ) as { words: { id: string; unit: number }[] }
  ).words
    .filter((w) => w.unit <= 20)
    .map((w) => w.id),
);
const unplaced = [...planned].filter((id) => !inUnitsSet.has(id));
ok(
  unplaced.length === 0,
  "every word the A1.1 plan names is taught by a unit",
  `${planned.size} planned, missing: ${unplaced.slice(0, 5).join(", ") || "none"}`,
);

const dangling = [...inUnitsSet].filter((id) => !wordIds.has(id));
ok(
  dangling.length === 0,
  "no unit points at a missing word",
  dangling.slice(0, 5).join(", "),
);

ok(
  inUnits.length === inUnitsSet.size,
  "no word is taught by two units",
  `${inUnits.length - inUnitsSet.size} repeated`,
);

const grammarIds = new Set(
  (db.prepare("SELECT id FROM grammar").all() as { id: string }[]).map(
    (g) => g.id,
  ),
);
const badGrammar = units.filter(
  (u) => u.grammar_id && !grammarIds.has(u.grammar_id),
);
ok(
  badGrammar.length === 0,
  "no unit points at a missing grammar point",
  badGrammar.map((u) => u.id).join(", "),
);

section("no unit is too big to finish");
/* A session introduces at most twelve words. A unit larger than that carries
   over to the next day, which is fine — but past about thirty it stops feeling
   like a unit and the reading and scenario go stale sitting there. */
const sizes = units
  .map((u) => (JSON.parse(u.word_ids_json) as string[]).length)
  .sort((a, b) => a - b);
ok(
  sizes[0] >= 5,
  "the smallest unit still teaches something",
  `${sizes[0]} words`,
);
ok(
  sizes.at(-1)! <= 32,
  "the largest unit is at most three days of vocabulary",
  `${sizes.at(-1)} words`,
);

section("every card can be shown");
const noGloss = words.filter((w) => !w.en?.trim());
ok(noGloss.length === 0, "every word has an English meaning", noGloss.length);

const nounsNoArticle = words.filter((w) => w.pos === "noun" && !w.article);
ok(
  nounsNoArticle.length === 0,
  "every noun has der/die/das",
  nounsNoArticle
    .slice(0, 5)
    .map((w) => w.lemma)
    .join(", "),
);

const badArticle = words.filter(
  (w) => w.article && !["der", "die", "das"].includes(w.article),
);
ok(badArticle.length === 0, "and it is one of the three", badArticle.length);

const LEVELS = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2"];
const badLevel = words.filter((w) => !LEVELS.includes(w.level));
ok(badLevel.length === 0, "every word sits at a real level", badLevel.length);

section("examples");
/* Without an example a word cannot be clozed, cannot appear in the sentence
   builder and cannot be drilled from Problemwörter — see attach-examples.mts. */
const withExample = (
  db
    .prepare(
      "SELECT COUNT(*) n FROM word WHERE example_de IS NOT NULL AND example_de <> ''",
    )
    .get() as { n: number }
).n;
const pct = Math.round((withExample / words.length) * 100);
ok(
  pct >= 95,
  "at least 95% of words have an example sentence",
  `${withExample}/${words.length} (${pct}%)`,
);

section("audio");
/* The .ogg files ship with the repo but `audio_url` is set by seeding, not by
   the download. When seeding did not link them, a fresh clone had every
   recording on disk and no way to play any of them. */
const AUDIO_DIR = path.join(process.cwd(), "public/audio/words");
if (existsSync(AUDIO_DIR)) {
  const onDisk = new Set(
    readdirSync(AUDIO_DIR)
      .filter((f) => f.endsWith(".ogg"))
      .map((f) => f.slice(0, -4)),
  );
  const linked = db
    .prepare(
      "SELECT id, audio_url FROM word WHERE audio_url IS NOT NULL AND audio_url <> ''",
    )
    .all() as { id: string; audio_url: string }[];
  const linkedIds = new Set(linked.map((w) => w.id));

  /* Recordings for words the deck no longer teaches are kept deliberately. */
  const unlinked = [...onDisk].filter(
    (id) => wordIds.has(id) && !linkedIds.has(id),
  );
  ok(
    unlinked.length === 0,
    "every recording whose word is still taught is linked",
    unlinked.slice(0, 5).join(", "),
  );

  const missingFile = linked.filter((w) => !onDisk.has(w.id));
  ok(
    missingFile.length === 0,
    "no word points at a recording that is not there",
    missingFile
      .slice(0, 5)
      .map((w) => w.id)
      .join(", "),
  );

  ok(
    linked.every((w) => w.audio_url === `/audio/words/${w.id}.ogg`),
    "and every link uses the served path",
    `${linked.length} recordings`,
  );
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

section("content made at runtime can be committed");
/* Segments and mnemonics are the only content the app creates that does not come from `data/`. */
const exporter = readFileSync(
  path.join(process.cwd(), "scripts/export-content.mts"),
  "utf8",
);
ok(
  /if \(attached \|\| removed\)/.test(exporter),
  "the exporter writes when it REMOVED something, not only when it added",
);
ok(
  !/some\(\(e\) => e\.segments\)/.test(exporter),
  "and does not infer that from the post-deletion state",
);
ok(
  /error_pattern|explanation/.test(exporter),
  "and says in writing which tables it refuses to export — this repo is public",
);

const seeder = readFileSync(
  path.join(process.cwd(), "scripts/seed.mts"),
  "utf8",
);
ok(/data\/mnemonics\.json/.test(seeder), "the seeder reads mnemonics back");
ok(
  /segments_json=CASE WHEN excluded\.segments_json IN/.test(seeder),
  "and an empty file never overwrites segments already in the database",
);

const mnem = path.join(process.cwd(), "data", "mnemonics.json");
if (existsSync(mnem)) {
  const parsed = JSON.parse(readFileSync(mnem, "utf8")) as {
    mnemonics?: Record<string, string>;
  };
  ok(
    typeof parsed.mnemonics === "object",
    "data/mnemonics.json has the shape the seeder expects",
  );
}

section("the six survival scenarios can be run without a network");
/*
 * These are the conversations you rehearse the night before, often on a phone with no signal, and
 * they were the only ones in the app with no scripted fallback — so "you need a network for this
 * one" arrived at the moment it was least useful.
 */
const survival = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data", "scenarios-survival.json"),
    "utf8",
  ),
) as {
  id: string;
  title: string;
  dialogue?: {
    them: string;
    options: { say: string; ok: boolean; why?: string; next: number }[];
  }[];
}[];

/* A floor, not a count. Principle 5 says this set grows, and a test that
   pins it at six turns adding a scenario into a failing build. */
ok(
  survival.length >= 6,
  "the pack is not shrinking",
  `${survival.length} scenarios`,
);
ok(
  new Set(survival.map((s) => s.id)).size === survival.length,
  "and no two share an id — the second would be unreachable at /alltag/<id>",
);

for (const s of survival) {
  const d = s.dialogue;
  if (!Array.isArray(d) || !d.length) {
    ok(false, `${s.id} has a scripted fallback`, s.title);
    continue;
  }
  ok(
    d.length >= 3,
    `${s.id}: long enough to be worth running`,
    `${d.length} turns`,
  );
  ok(
    d.every((t) => t.options.some((o) => o.ok)),
    `${s.id}: every turn has a right answer`,
  );
  ok(
    d.every((t) => t.options.every((o) => o.ok || o.why)),
    `${s.id}: every wrong answer explains itself — here the explanation IS the lesson`,
  );
  /* Forward-only so the tree cannot loop, and every destination real so it
     cannot dead-end. -1 is the exit. */
  ok(
    d.every((t, i) =>
      t.options.every(
        (o) => o.next === -1 || (o.next > i && o.next < d.length),
      ),
    ),
    `${s.id}: every branch leads to a later turn or to the end`,
  );
  ok(
    d.some((t) => t.options.some((o) => o.next === -1)),
    `${s.id}: the conversation can actually finish`,
  );
}

db.close();
done();
