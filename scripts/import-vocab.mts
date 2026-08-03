/**
 * Grow the deck from A1–thin-B1 to a full B1, using openly-licensed sources.
 *
 *   node scripts/import-vocab.mts            # download, pick, emit
 *   node scripts/import-vocab.mts --dry      # show what it would add
 *   node scripts/import-vocab.mts --target 2400
 *
 * WHY NOT THE GOETHE WORDLIST. It is the obvious source and it is the wrong
 * one here, twice over. Reconstructing it from memory produces a plausible list
 * that is silently wrong, which is worse than no list. And this repository is
 * public, so committing an extraction of their compiled work would be
 * redistributing it. Neither problem exists with the two sources below.
 *
 * WHAT IT USES
 *   frequency  hermitdave/FrequencyWords, German subtitle corpus, CC BY-SA 4.0.
 *              Frequency is the honest proxy for "should a learner meet this
 *              early" — far better than a hand-guessed level.
 *   meanings   kaikki.org's machine-readable extract of English Wiktionary,
 *              CC BY-SA 3.0. Gives the English gloss, the part of speech, the
 *              noun's gender and its plural — all the fields the app needs.
 *
 * Neither download is committed; both are cached under data/vocab/ and
 * gitignored. What IS committed is the chosen list, so a fresh clone rebuilds
 * the deck with no network at all.
 *
 * LEVELS ARE FREQUENCY BANDS, and the app says so. A word's level here means
 * "this is roughly how early you meet it", not a claim about the CEFR
 * descriptors. The targets below approximate the usual cumulative sizes —
 * A1 650, A2 1300, B1 2400.
 */
import { DatabaseSync } from "node:sqlite";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { DB_PATH } from "../src/lib/db.ts";

const ROOT = process.cwd();
const CACHE = path.join(ROOT, "data", "vocab");
const FREQ = path.join(CACHE, "de_50k.txt");
const KAIKKI = path.join(CACHE, "kaikki-de.jsonl");
const OUT_WORDS = path.join(ROOT, "data", "words-extra.json");
const OUT_UNITS = path.join(ROOT, "data", "unit-additions.json");

const FREQ_URL =
  "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/de/de_50k.txt";
const KAIKKI_URL = "https://kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl";
const UA = "DeutschMate/1.0 (personal language-learning app)";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const TARGET = Number(args[args.indexOf("--target") + 1]) || 2400;

const LEVELS = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2"] as const;
type Level = (typeof LEVELS)[number];

/** Cumulative deck size each level should reach. */
const CUMULATIVE: Record<Level, number> = {
  "A1.1": Math.round(TARGET * 0.083),
  "A1.2": Math.round(TARGET * 0.271),
  "A2.1": Math.round(TARGET * 0.406),
  "A2.2": Math.round(TARGET * 0.542),
  "B1.1": Math.round(TARGET * 0.771),
  "B1.2": TARGET,
};

/**
 * Parts of speech worth teaching.
 *
 * `pron` and `article` are deliberately absent. A subtitle frequency list puts
 * der/die/das/ein at the very top, and Wiktionary glosses "der" as
 * "who; that; which" — true of the relative pronoun and thoroughly confusing
 * as a beginner's flashcard. Articles and pronouns are taught by the grammar
 * points that exist for them, not as vocabulary.
 */
const KEEP_POS: Record<string, string> = {
  noun: "noun",
  verb: "verb",
  adj: "adj",
  adv: "adv",
  prep: "prep",
  conj: "conj",
  num: "num",
  intj: "phrase",
};

/**
 * Senses that disqualify a word outright.
 *
 * A subtitle corpus is full of swearing, and the first dry run duly proposed
 * teaching a flatmate the word for "slut". Wiktionary tags this reliably, so
 * the filter can be exact rather than a guessed word list. If ANY sense of a
 * word carries one of these, the whole word is dropped — a learner meeting it
 * on a card has no way to know which sense was intended.
 */
const BANNED_TAGS = new Set([
  "vulgar", "offensive", "derogatory", "ethnic-slur", "slur", "obscene", "pejorative",
]);

/** Senses that are real but wrong to learn a word BY. */
const WEAK_SENSE_TAGS = new Set([
  "slang", "obsolete", "archaic", "rare", "dated", "uncommon", "humorous", "poetic",
]);

/** Glosses that mean "this is a name or a demonym", not a word. */
const NOT_A_WORD =
  /^(a |an )?(female |male )?(given name|surname|family name|native or resident|nickname|placename|toponym)/i;

/** Glosses that mean "this is an inflected form of another word". */
const INFLECTION =
  /\b(inflection|nominalization|genitive|dative|accusative|nominative|plural|singular|past participle|participle|comparative|superlative|imperative|subjunctive|preterite|form)\b[^.]{0,30}\bof\b/i;

/** Glosses that describe the word instead of translating it. */
const NOT_A_MEANING = /^(only )?used\b|^(expressing|indicating|denoting)\b|^see\b|^alternative\b/i;

const GENDER: Record<string, string> = { m: "der", f: "die", n: "das" };

// ---------------------------------------------------------------- download
async function ensure(file: string, url: string, label: string) {
  if (existsSync(file)) {
    console.log(`  cached  ${label}  ${(statSync(file).size / 1048576).toFixed(1)} MB`);
    return;
  }
  console.log(`  fetching ${label} …`);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${label}: ${res.status} ${res.statusText}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`  saved   ${label}  ${(statSync(file).size / 1048576).toFixed(1)} MB`);
}

mkdirSync(CACHE, { recursive: true });
console.log("Sources");
await ensure(FREQ, FREQ_URL, "frequency list");
await ensure(KAIKKI, KAIKKI_URL, "Wiktionary extract");

// ------------------------------------------------------------ what we have
const db = new DatabaseSync(DB_PATH, { readOnly: true });
db.exec("PRAGMA busy_timeout = 10000");

const lower = (s: string) => s.toLocaleLowerCase("de");

/* A previous run's output is already seeded into the database, so counting it
   as "words we have" would make a second run pick nothing and then overwrite
   both output files with almost-empty ones. The importer owns everything in
   words-extra.json, so it rebuilds that set from scratch each time and ignores
   its own earlier picks here. Re-running is therefore idempotent. */
const mine = new Set<string>();
if (existsSync(OUT_WORDS)) {
  for (const w of JSON.parse(readFileSync(OUT_WORDS, "utf8")) as { id: string }[]) mine.add(w.id);
}
if (mine.size) console.log(`  ignoring ${mine.size} words from this importer's last run`);

const existing = new Set<string>();
const existingCount: Record<string, number> = {};
for (const w of db.prepare("SELECT id, lemma, level, plural, forms_json FROM word").all() as {
  id: string;
  lemma: string;
  level: string;
  plural: string | null;
  forms_json: string | null;
}[]) {
  if (mine.has(w.id)) continue;
  existing.add(lower(w.lemma));
  existingCount[w.level] = (existingCount[w.level] ?? 0) + 1;
  // An inflected form of a word we teach is not a new word. The plural lives
  // in its own column, not in forms_json — missing it let "Informationen"
  // through as a separate word from "Information".
  if (w.plural) existing.add(lower(w.plural));
  if (w.forms_json) {
    try {
      for (const f of Object.values(JSON.parse(w.forms_json) as Record<string, string>)) {
        if (typeof f === "string" && f) existing.add(lower(f));
      }
    } catch {
      /* ignore */
    }
  }
}
const units = db
  .prepare("SELECT id, level, ord, word_ids_json FROM unit ORDER BY level, ord")
  .all() as { id: string; level: string; ord: number; word_ids_json: string }[];
db.close();

console.log("\nCurrent deck");
let running = 0;
const need: Record<Level, number> = {} as Record<Level, number>;
let prevTarget = 0;
for (const lv of LEVELS) {
  const have = existingCount[lv] ?? 0;
  running += have;
  const want = CUMULATIVE[lv] - prevTarget;
  prevTarget = CUMULATIVE[lv];
  need[lv] = Math.max(0, want - have);
  console.log(`  ${lv}  have ${String(have).padStart(4)}  want ${String(want).padStart(4)}  add ${need[lv]}`);
}
const totalNeeded = LEVELS.reduce((n, lv) => n + need[lv], 0);
console.log(`  total in deck ${running} → target ${TARGET}, adding up to ${totalNeeded}`);

// -------------------------------------------------------- frequency order
const freq: string[] = [];
for (const line of readFileSync(FREQ, "utf8").split("\n")) {
  const w = line.split(" ")[0]?.trim();
  if (w && /^[a-zäöüß]+$/i.test(w) && w.length > 1) freq.push(w);
}
console.log(`\nFrequency list: ${freq.length} usable tokens`);

const wanted = new Set<string>();
for (const w of freq) {
  if (!existing.has(lower(w))) wanted.add(lower(w));
  if (wanted.size >= totalNeeded * 4) break; // headroom for ones with no gloss
}
console.log(`Looking up ${wanted.size} candidates in the Wiktionary extract`);

// ------------------------------------------------------------ the lookup
type Entry = {
  lemma: string;
  pos: string;
  article: string | null;
  plural: string | null;
  en: string;
  forms: Record<string, string> | null;
};

const found = new Map<string, Entry>();
/** Words rejected outright. A different POS of the same word must not sneak in. */
const banned = new Set<string>();

/** kaikki puts noun gender in the head template's first argument: "n,-(e)s,-". */
function genderOf(e: Record<string, unknown>): string | null {
  const ht = (e.head_templates as { args?: Record<string, string> }[] | undefined)?.[0];
  const a1 = ht?.args?.["1"];
  if (typeof a1 !== "string") return null;
  return GENDER[a1.trim()[0]] ?? null;
}

function pluralOf(e: Record<string, unknown>): string | null {
  const forms = (e.forms as { form?: string; tags?: string[] }[] | undefined) ?? [];
  const p = forms.find(
    (f) => f.form && f.tags?.includes("plural") && !f.tags.includes("genitive"),
  );
  return p?.form && /^[A-Za-zÄÖÜäöüß\- ]+$/.test(p.form) ? p.form : null;
}

/** Present-tense forms, so the review card can show a conjugation. */
function verbForms(e: Record<string, unknown>): Record<string, string> | null {
  const forms = (e.forms as { form?: string; tags?: string[] }[] | undefined) ?? [];
  const pick = (...tags: string[]) =>
    forms.find((f) => f.form && tags.every((t) => f.tags?.includes(t)))?.form;
  const out: Record<string, string> = {};
  const ich = pick("first-person", "singular", "present");
  const du = pick("second-person", "singular", "present");
  const er = pick("third-person", "singular", "present");
  if (ich) out["ich"] = ich;
  if (du) out["du"] = du;
  if (er) out["er/sie/es"] = er;
  return Object.keys(out).length === 3 ? out : null;
}

type Sense = { glosses?: string[]; tags?: string[]; form_of?: unknown; alt_of?: unknown };

/** True if ANY sense of this word is one a learning deck should not carry. */
function isBanned(e: Record<string, unknown>): boolean {
  const senses = (e.senses as Sense[] | undefined) ?? [];
  return senses.some((s) => s.tags?.some((t) => BANNED_TAGS.has(t)));
}

/** First usable English gloss: short, current, and a word rather than a form. */
function glossOf(e: Record<string, unknown>): string | null {
  const senses = (e.senses as Sense[] | undefined) ?? [];
  for (const s of senses) {
    if (s.form_of || s.alt_of) continue;
    if (s.tags?.some((t) => WEAK_SENSE_TAGS.has(t) || t === "form-of")) continue;

    const g = s.glosses?.[0];
    if (!g) continue;
    if (INFLECTION.test(g)) continue;
    if (NOT_A_WORD.test(g)) continue;
    if (g.length > 60) continue;

    // "only used in zurechtweisen", "expressing understanding" — a note about
    // the word, not a translation of it.
    if (NOT_A_MEANING.test(g)) continue;

    // Trim a trailing parenthetical, then anything after a semicolon — the
    // first clause is the meaning, the rest is usually a synonym list. A
    // trailing "etc." is Wiktionary shorthand for "and more synonyms".
    const clean = g
      .replace(/\s*\([^)]*\)\s*$/, "")
      .split(";")[0]
      .replace(/,?\s*etc\.?\s*$/i, "")
      .trim();
    return clean.length >= 2 ? clean : null;
  }
  return null;
}

/** Every past/present participle in the file, filled in during the scan. */
const participles = new Set<string>();

const rl = createInterface({ input: createReadStream(KAIKKI, "utf8"), crlfDelay: Infinity });
let scanned = 0;
for await (const line of rl) {
  scanned++;
  if (!line || line[0] !== "{") continue;
  // Cheap pre-filter before the JSON parse — most lines are irrelevant.
  let e: Record<string, unknown>;
  try {
    e = JSON.parse(line);
  } catch {
    continue;
  }
  const word = e.word as string | undefined;
  if (!word) continue;

  /* Every verb entry lists its own participles, so collect them from the whole
     file rather than guessing at prefixes. Wiktionary also files many of those
     participles as plain adjectives with real glosses (verändert, geschlossen,
     vorgestellt), and no tag on the adjective entry says so. */
  if (e.pos === "verb") {
    for (const f of (e.forms ?? []) as { form?: string; tags?: string[] }[]) {
      if (f.form && f.tags?.includes("participle")) participles.add(lower(f.form));
    }
  }

  if (!wanted.has(lower(word))) continue;

  const pos = KEEP_POS[e.pos as string];
  if (!pos) continue;
  if (found.has(lower(word))) continue;
  if (isBanned(e)) {
    banned.add(lower(word));
    continue;
  }

  const en = glossOf(e);
  if (!en) continue;

  found.set(lower(word), {
    lemma: word,
    pos,
    article: pos === "noun" ? genderOf(e) : null,
    plural: pos === "noun" ? pluralOf(e) : null,
    en,
    forms: pos === "verb" ? verbForms(e) : null,
  });
}
rl.close();
console.log(`Scanned ${scanned.toLocaleString("en")} entries, matched ${found.size}`);

// ------------------------------------------------------------- assignment
const slug = (s: string) =>
  lower(s)
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * A comparative or a participle of something already in the deck.
 *
 * Wiktionary lists "schlimmer" and "geführt" as plain adjectives with real
 * glosses, so no tag catches them — but teaching them as separate cards next
 * to schlimm and führen is teaching the same thing twice, and the learner has
 * no way to see they are related.
 */
function isDerived(e: Entry): boolean {
  if (e.pos !== "adj" && e.pos !== "adv") return false;
  const w = lower(e.lemma);

  // näher → nah / nahe, schlimmer → schlimm
  if (w.endsWith("er")) {
    const stem = w.slice(0, -2);
    const unUmlaut = stem.replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u");
    if (existing.has(stem) || existing.has(stem + "e") || existing.has(unUmlaut)) return true;
  }

  /* geführt, gebaut, geschlossen, verändert, vorgestellt — all participles that
     Wiktionary also files as adjectives. Matching against the participle list
     collected from the verb entries catches the prefixed and strong ones too,
     which no ge-…-t rule could. A handful of genuine adjectives are participles
     historically (bekannt, verrückt); losing those is the right trade, because
     the alternative is a card whose front is a verb form and whose back is the
     verb's meaning, with nothing to say which verb. */
  if (participles.has(w)) return true;

  return false;
}

/**
 * A German infinitive always ends in -n. Wiktionary tags some participles as
 * verbs anyway ("gefühlt"), and a card whose front is a participle but whose
 * back is the infinitive's meaning teaches the wrong form.
 */
function isNotAnInfinitive(e: Entry): boolean {
  return e.pos === "verb" && !lower(e.lemma).endsWith("n");
}

type Out = Entry & { id: string; level: Level; rank: number };
const picked: Out[] = [];
const usedIds = new Set<string>();
const budget = { ...need };

let rank = 0;
for (const w of freq) {
  rank++;
  const hit = found.get(lower(w));
  if (!hit) continue;
  // A word banned in one part of speech is banned in all of them.
  if (banned.has(lower(w))) continue;
  if (isDerived(hit)) continue;
  if (isNotAnInfinitive(hit)) continue;
  /* No gender means no card worth having: the whole point of a German noun
     card is der/die/das. What lands here is nominalised adjectives (Lieber,
     Beste), bare plurals (Drogen) and titles (Don) — none of them nouns to
     learn in isolation. */
  if (hit.pos === "noun" && !hit.article) continue;

  // Earliest level still short goes first — the commonest words come earliest.
  const level = LEVELS.find((lv) => budget[lv] > 0);
  if (!level) break;

  const id = slug(hit.lemma);
  if (!id || usedIds.has(id) || existing.has(lower(hit.lemma))) continue;
  usedIds.add(id);

  budget[level]--;
  picked.push({ ...hit, id, level, rank });
}

console.log(`\nPicked ${picked.length}`);
for (const lv of LEVELS) {
  const n = picked.filter((p) => p.level === lv).length;
  console.log(`  ${lv}  +${n}`);
}

console.log("\nSample:");
for (const lv of LEVELS) {
  const s = picked.filter((p) => p.level === lv).slice(0, 3);
  for (const p of s) {
    const head = p.article ? `${p.article} ${p.lemma}` : p.lemma;
    console.log(`  ${lv}  ${head.padEnd(22)} ${p.pos.padEnd(5)} ${p.en}`);
  }
}

if (dry) {
  console.log("\n--dry: nothing written.");
  process.exit(0);
}

// ---------------------------------------------------------------- emit
writeFileSync(
  OUT_WORDS,
  JSON.stringify(
    picked.map((p) => ({
      id: p.id,
      lemma: p.lemma,
      article: p.article ?? undefined,
      plural: p.plural ?? undefined,
      pos: p.pos,
      en: p.en,
      level: p.level,
      forms: p.forms ?? undefined,
      source: "wiktionary",
      freq_rank: p.rank,
    })),
    null,
    1,
  ),
  "utf8",
);

/* Spread each level's new words across that level's existing units.
   Units already carry over to a second day when they hold more words than one
   session introduces, so growing them is safe — and it keeps every unit's
   reading, scenario and grammar attached, which brand-new units would not have.

   Each word goes to the smallest unit of its level, so the hand-written units
   (11 to 22 words each) even out. Adding round-robin instead would preserve
   that spread and leave a four-day unit sitting next to a two-day one. */
const additions: Record<string, string[]> = {};
const finalSize = new Map<string, number>();
for (const lv of LEVELS) {
  const lvUnits = units.filter((u) => u.level === lv);
  const lvWords = picked.filter((p) => p.level === lv);
  // Base size = the hand-written words only; a previous run's picks are re-spread.
  for (const u of lvUnits) {
    const base = (JSON.parse(u.word_ids_json) as string[]).filter((id) => !mine.has(id));
    finalSize.set(u.id, base.length);
  }
  if (!lvUnits.length || !lvWords.length) continue;
  for (const w of lvWords) {
    let target = lvUnits[0];
    for (const u of lvUnits) if (finalSize.get(u.id)! < finalSize.get(target.id)!) target = u;
    finalSize.set(target.id, finalSize.get(target.id)! + 1);
    (additions[target.id] ??= []).push(w.id);
  }
}
writeFileSync(OUT_UNITS, JSON.stringify(additions, null, 1), "utf8");

const sizes = [...finalSize.values()].sort((a, b) => a - b);
console.log(`\nwrote ${path.relative(ROOT, OUT_WORDS)}   ${picked.length} words`);
console.log(
  `wrote ${path.relative(ROOT, OUT_UNITS)}  ${Object.keys(additions).length} units` +
    `  ->  units end up holding ${sizes[0]}–${sizes.at(-1)} words (median ${sizes[sizes.length >> 1]})`,
);
console.log(`\nNext:  npm run seed && npm run attach-examples && npm run seed`);
console.log(`Then:  npm run audio   (fetches pronunciations for the new words)`);
