import { all } from "./db";

/**
 * Read any German text against what this learner actually knows.
 *
 * The course can only ever teach from its own 38 readings. This is the piece
 * that points the same machinery at a WG advert, a letter from the
 * Ausländerbehörde, or a menu — the text you actually need to understand today.
 *
 * Every token is sorted into one of four buckets, and the distinctions matter:
 *
 *   known    you have met it — a card with at least one real rep
 *   queued   you added it, it is waiting, you have not studied it yet
 *   course   the course teaches it, you just haven't reached it yet
 *   unknown  not in the 2,400 words at all
 *
 * `queued` exists because adding words must visibly do something without
 * inflating anything. Coverage counts only `known`, so it does not move when
 * you queue a hundred words — you haven't learned them. But the words leave
 * the "new" list, so the button clearly did what it said.
 *
 * "unknown" is not a judgement about the word — it means the app has nothing
 * to say about it, which is a fact about the app, not about your German.
 */

export type ScanWord = {
  form: string;
  count: number;
  wordId: string | null;
  lemma: string | null;
  article: string | null;
  en: string | null;
  level: string | null;
  /** reps > 0 — actually met, not merely present in the deck table. */
  known: boolean;
  /** A card exists but has never been reviewed: added, not yet learned. */
  queued: boolean;
};

export type Scan = {
  tokens: number;
  distinct: number;
  known: number;
  queued: number;
  course: number;
  unknown: number;
  /** Every distinct form, commonest first. */
  words: ScanWord[];
  /** Rough readability: share of running words you have already met. */
  coverage: number;
};

const lower = (s: string) => s.toLocaleLowerCase("de");

/** Umlaut-folded, for matching inflected forms whose stem changes. */
const fold = (s: string) =>
  lower(s).replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss");

export function tokenize(text: string): string[] {
  return text
    .replace(/[.,!?;:„“”"»«()[\]{}\-–—…/\\|*#>]/g, " ")
    .replace(/\d+/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^['’]+|['’]+$/g, ""))
    .filter((t) => t.length > 0);
}

type Row = {
  id: string;
  lemma: string;
  article: string | null;
  en: string;
  level: string;
  forms_json: string | null;
};

/**
 * form → word, built once per request.
 *
 * Includes every inflected form the course generated, because a text says
 * "geht" and "Häuser", never "gehen" and "Haus".
 */
function formIndex() {
  const rows = all<Row>("SELECT id, lemma, article, en, level, forms_json FROM word");
  const byForm = new Map<string, Row>();
  const byStem = new Map<string, Row>();

  const put = (m: Map<string, Row>, k: string, r: Row) => {
    if (!m.has(k)) m.set(k, r);
  };

  for (const r of rows) {
    put(byForm, lower(r.lemma), r);
    put(byStem, fold(r.lemma), r);
    if (r.forms_json) {
      try {
        for (const f of Object.values(JSON.parse(r.forms_json) as Record<string, string>)) {
          if (typeof f === "string" && f) {
            put(byForm, lower(f), r);
            put(byStem, fold(f), r);
          }
        }
      } catch {
        /* a malformed forms blob contributes nothing */
      }
    }
  }
  return { byForm, byStem };
}

export function scanText(userId: string, text: string): Scan {
  const tokens = tokenize(text);
  const { byForm, byStem } = formIndex();

  const cards = new Map(
    all<{ ref_id: string; reps: number }>(
      "SELECT ref_id, reps FROM card WHERE user_id = ? AND ref_type = 'word'",
      userId,
    ).map((r) => [r.ref_id, r.reps]),
  );

  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);

  const words: ScanWord[] = [];
  let known = 0;
  let queued = 0;
  let course = 0;
  let unknown = 0;
  let knownTokens = 0;

  for (const [form, count] of counts) {
    // Exact form first; only then the umlaut-folded stem, so "schon" is never
    // silently matched to "schön".
    const hit = byForm.get(lower(form)) ?? byStem.get(fold(form)) ?? null;
    const reps = hit ? cards.get(hit.id) : undefined;
    const met = reps !== undefined && reps > 0;
    const waiting = reps !== undefined && reps === 0;

    if (!hit) unknown++;
    else if (met) {
      known++;
      knownTokens += count;
    } else if (waiting) queued++;
    else course++;

    words.push({
      form,
      count,
      wordId: hit?.id ?? null,
      lemma: hit?.lemma ?? null,
      article: hit?.article ?? null,
      en: hit?.en ?? null,
      level: hit?.level ?? null,
      known: met,
      queued: waiting,
    });
  }

  words.sort((a, b) => b.count - a.count || a.form.localeCompare(b.form, "de"));

  return {
    tokens: tokens.length,
    distinct: counts.size,
    known,
    queued,
    course,
    unknown,
    words,
    // Only `known` counts. Queuing a word does not make the text easier to
    // read, and a number that jumped when you pressed a button would be a lie.
    coverage: tokens.length ? Math.round((knownTokens / tokens.length) * 100) : 0,
  };
}
