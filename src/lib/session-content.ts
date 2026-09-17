import { all, get } from "./db";
import { LEVELS } from "./levels";
import { shuffle } from "./util";
import type { Unit, Word } from "./session-types";

/**
 * Parse a content column that may be absent, empty, the four characters "null",
 * or — these files are hand-written — malformed. Anything that is not an object
 * comes back as null, so callers can test the thing itself rather than testing
 * whether some string was non-empty.
 */
export function safeJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
}

/**
 * Extra sentences from the corpus, at or below the learner's level AND inside
 * the grammar they have been taught.
 *
 * `level` alone is how common the words are, and that is what put a relative
 * clause in front of a beginner: every word in "Mein Vater ist der, der Tee
 * trinkt" is common. `reach` is the unit the learner has got to, on the 1..40
 * A1 scale, and needs_unit is what the sentence actually demands.
 */
export function corpusSentences(
  level: string,
  reach: number,
  dayIndex: number,
  limit: number,
) {
  const levels = LEVELS.slice(
    0,
    Math.max(1, LEVELS.indexOf(level as (typeof LEVELS)[number]) + 1),
  );
  const ph = levels.map(() => "?").join(",");
  const where = `level IN (${ph}) AND needs_unit <= ?`;
  const args = [...levels, reach];

  /* A window that moves by one page a day. Two things broke it. */
  const total =
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sentence WHERE ${where}`,
      ...args,
    )?.n ?? 0;
  /* Empty is a real answer in the first eleven units: the course has not taught
     a finite verb yet, so there is no sentence the learner could build. The
     unit's own curated examples carry those blocks. */
  if (!total) return [];

  const offset = (dayIndex * limit) % total;
  const rows = all<{
    id: string;
    de: string;
    en: string;
    source: string | null;
  }>(
    `SELECT id, de, en, source FROM sentence
      WHERE ${where} ORDER BY id LIMIT ? OFFSET ?`,
    ...args,
    limit,
    offset,
  );

  /* Wrap round rather than returning a short block on the last page — but only
     when there is a second page to wrap to. The gate can leave fewer sentences
     than a block wants, and wrapping into a pool smaller than the limit hands
     back the same sentence twice: heard, then heard again. */
  if (rows.length < limit && total > limit) {
    rows.push(
      ...all<{ id: string; de: string; en: string; source: string | null }>(
        `SELECT id, de, en, source FROM sentence
          WHERE ${where} ORDER BY id LIMIT ?`,
        ...args,
        limit - rows.length,
      ),
    );
  }
  return rows;
}

/**
 * Listening items: hear it, type it. Before the corpus import this block could only ever offer as
 * many items as the unit had example sentences, which was often three.
 */
export function listeningItems(
  words: Word[],
  level: string,
  reach: number,
  dayIndex: number,
) {
  const curated = words
    .filter((w) => w.example_de)
    .slice(0, 5)
    .map((w) => ({
      wordId: w.id,
      de: w.example_de!,
      en: w.example_en ?? "",
      /*
       * NOT w.audio_url. That is a recording of the lemma — "hallo" — while
       * the answer here is the whole example sentence, "Hallo, ich bin Mira."
       * playAt() prefers a file whenever it is given one, so the block played
       * a single word, waited for the sentence, and marked it wrong. There is
       * no sentence recording to put here instead: every sentence.audio_url is
       * NULL and the 2,381 files on disk are all single words. Passing null
       * falls through to speech synthesis, which reads the whole sentence —
       * which is what the corpus items below have always done, and why only
       * the first five items of the block were broken.
       */
      audio: null as string | null,
      credit: null as string | null,
    }));

  const extra = corpusSentences(level, reach, dayIndex, 8 - curated.length).map(
    (s) => ({
      wordId: s.id,
      de: s.de,
      en: s.en,
      audio: null,
      credit: s.source,
    }),
  );

  return [...curated, ...extra];
}

/** Sentence-builder items. */
export function builderItems(
  unit: Unit,
  words: Word[],
  level: string,
  reach: number,
  dayIndex: number,
) {
  const make = (id: string, de: string, en: string, credit: string | null) => {
    const tokens = de.replace(/([.!?])$/, "").split(/\s+/);
    return {
      wordId: id,
      en,
      answer: de,
      tokens: shuffle(tokens),
      punctuation: (de.match(/[.!?]$/) ?? ["."])[0],
      credit,
    };
  };

  const curated = words
    .filter((w) => w.example_de && w.example_en)
    .slice(0, 5)
    .map((w) => make(w.id, w.example_de!, w.example_en!, null));

  // Offset the corpus cursor from the listening block's, or the same sentence
  // turns up twice in one session — heard, then rebuilt.
  const extra = corpusSentences(
    level,
    reach,
    dayIndex + 7,
    8 - curated.length,
  ).map((s) => make(s.id, s.de, s.en, s.source));

  return [...curated, ...extra];
}

/** Fix-block drills: pull grammar drills whose point matches the failing tag. */
export function drillsForTags(tags: string[]) {
  /* Every tag the classifier can produce needs a row here, or the Fix block
     silently has nothing to drill for it. The four new ones — dative, genitive,
     the perfect auxiliary and prepositions — arrived with the prebuilt error
     patterns, and all four already had a grammar point written. */
  const TAG_TO_SLUG: Record<string, string[]> = {
    "article-gender": ["artikel-nominativ"],
    "article-akkusativ": ["akkusativ"],
    "article-dativ": ["dativ", "praepositionen-kasus"],
    "article-genitiv": ["genitiv"],
    /* verb-haben was folded into verb-sein — A1.1 unit 8 is "Sein und haben"
       and a unit carries one rule, so haben had been written and taught to
       nobody. Its drills moved with it, so this tag lost no material. */
    "verb-ending": ["praesens-regular", "verb-sein"],
    "verb-position-2": ["verb-position-2"],
    "verb-final": ["modalverben"],
    "perfekt-hilfsverb": ["perfekt"],
    praeposition: ["praepositionen-kasus", "wechselpraepositionen"],
    plural: ["plural"],
    negation: ["nicht-kein"],
    pronoun: ["personalpronomen"],
    "word-order": ["verb-position-2", "nebensaetze"],
  };
  const slugs = [...new Set(tags.flatMap((t) => TAG_TO_SLUG[t] ?? []))];
  if (!slugs.length) return [];
  const ph = slugs.map(() => "?").join(",");
  const rows = all<{ slug: string; title: string; drills_json: string }>(
    `SELECT slug, title, drills_json FROM grammar WHERE slug IN (${ph})`,
    ...slugs,
  );
  return rows.flatMap((r) =>
    (
      JSON.parse(r.drills_json) as {
        q: string;
        options: string[];
        a: number;
        why: string;
      }[]
    )
      .slice(0, 3)
      .map((d) => ({ ...d, from: r.title, slug: r.slug })),
  );
}

/** A writing prompt tied to the unit's own can-do statements. */
export function writingPrompt(unit: Unit): string {
  const canDo: string[] = JSON.parse(unit.can_do_json);
  const byUnit: Record<string, string> = {
    "a1-1-u02": "Stell dich vor. Wie heißt du, woher kommst du?",
    "a1-1-u04": "Wo kommst du her und wo wohnst du jetzt?",
    "a1-1-u07": "Beschreibe deine Familie.",
    "a1-1-u09": "Was isst und trinkst du gern?",
    "a1-1-u12": "Was machst du diese Woche? Schreib über drei Tage.",
  };
  return (
    byUnit[unit.id] ??
    (canDo.length
      ? `Schreib ein paar Sätze: ${canDo[0]}.`
      : `Schreib über „${unit.title}".`)
  );
}
