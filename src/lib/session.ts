import { all, get, run, tx } from "./db";
import { dueCards, dueCount } from "./srs";
import { topErrorTags } from "./errors";
import { dueCloze, mineFromErrors } from "./cloze";
import { rhythmFor, today } from "./rhythm";
import { dueGrammar } from "./grammar-srs";
import { NEW_WORDS_PER_DAY, NEW_WORDS_REDUCED, REVIEW_CAP } from "@/lib/config";

/**
 * The session runner (spec §3).
 *
 * Fixed rhythm, variable content. The rhythm never changes so it becomes a
 * habit; the scheduler picks what fills each block. This is the "one button" —
 * the user never chooses a lesson.
 */

export type BlockKind =
  | "review"
  | "fix"
  | "new-vocab"
  | "new-grammar"
  | "listening"
  | "reading"
  | "video"
  | "builder"
  | "conversation"
  | "writing"
  | "speaking"
  | "cloze"
  | "grammar-review"
  | "quiz";

export type Block = {
  kind: BlockKind;
  title: string;
  minutes: number;
  /** Can this block run with no network? Spec §17 — the session never dead-ends. */
  offline: boolean;
  skippable: boolean;
  payload: unknown;
};

export type Unit = {
  id: string;
  level: string;
  ord: number;
  title: string;
  can_do_json: string;
  word_ids_json: string;
  grammar_id: string | null;
  video_id: string | null;
  reading_id: string | null;
  scenario_json: string | null;
  dialogue_json: string | null;
  prereq_json: string;
};

export type Grammar = {
  id: string;
  slug: string;
  title: string;
  level: string;
  explain_md: string;
  examples_json: string;
  drills_json: string;
};

export type Word = {
  id: string;
  lemma: string;
  article: string | null;
  plural: string | null;
  pos: string;
  en: string;
  audio_url: string | null;
  forms_json: string | null;
  example_de: string | null;
  example_en: string | null;
  mnemonic: string | null;
};

/** What we drop to when the existing load is clearly not sticking. */

/**
 * How many new words to introduce today.
 *
 * A fixed 12/day is a promise the learner may not be able to keep. If the last
 * week of reviews is going badly, adding twelve more words makes tomorrow worse
 * — the backlog compounds and that is the point where people quit.
 *
 * Purely counted from attempts, and it needs a real sample (20+ reviews) before
 * it will act, so one bad morning doesn't throttle the course. Returns the
 * reason too, because the app must be able to say WHY it slowed down rather
 * than quietly giving you less.
 */
export function newWordBudget(userId: string) {
  const row = get<{ n: number; correct: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(correct),0) AS correct
       FROM attempt
      WHERE user_id = ? AND kind = 'review'
        AND created_at > datetime('now','-7 days')`,
    userId,
  );

  const n = row?.n ?? 0;
  if (n < 20) return { words: NEW_WORDS_PER_DAY, accuracy: null as number | null, reduced: false };

  const accuracy = Math.round(((row?.correct ?? 0) / n) * 100);
  const reduced = accuracy < 80;
  return { words: reduced ? NEW_WORDS_REDUCED : NEW_WORDS_PER_DAY, accuracy, reduced };
}

// ---------------------------------------------------------------- progression

export function unitsFor(level: string) {
  return all<Unit>("SELECT * FROM unit WHERE level = ? ORDER BY ord", level);
}

export function unitStatus(userId: string, unitId: string) {
  return (
    get<{ status: string }>(
      "SELECT status FROM unit_progress WHERE user_id = ? AND unit_id = ?",
      userId,
      unitId,
    )?.status ?? "locked"
  );
}

/** Words in a unit that the user has never been shown. */
function unseenWords(userId: string, wordIds: string[]): Word[] {
  if (!wordIds.length) return [];
  const ph = wordIds.map(() => "?").join(",");
  return all<Word>(
    `SELECT w.* FROM word w
       LEFT JOIN card c ON c.ref_id = w.id AND c.ref_type='word' AND c.user_id = ?
      WHERE w.id IN (${ph}) AND (c.id IS NULL OR c.reps = 0)
      ORDER BY w.freq_rank`,
    userId,
    ...wordIds,
  );
}

function wordsIn(ids: string[]): Word[] {
  if (!ids.length) return [];
  const ph = ids.map(() => "?").join(",");
  return all<Word>(`SELECT * FROM word WHERE id IN (${ph}) ORDER BY freq_rank`, ...ids);
}

/** The course, in order. A1.1 → B1.2, exactly the scope in the spec. */
export const LEVELS = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2"] as const;

/** Every unit this learner has finished. One query, for the walk below. */
function completedUnits(userId: string): Set<string> {
  return new Set(
    all<{ unit_id: string }>(
      "SELECT unit_id FROM unit_progress WHERE user_id = ? AND status = 'complete'",
      userId,
    ).map((r) => r.unit_id),
  );
}

/**
 * Spec §7: a unit is available once its prerequisites are complete.
 *
 * `prereq_json` has been on every unit row since the first migration and was
 * read nowhere — 120 rows of correct data that nothing consulted, which is a
 * trap rather than a feature. Either read it or drop the column; it is read
 * now.
 *
 * Today it agrees with `ord` order exactly (each unit requires the one before,
 * across level boundaries), so this changes no behaviour. It is a guarantee
 * rather than a change: if the data and the ordering ever disagree, the data
 * wins, which is the right way round when a curriculum gets reshuffled.
 *
 * A prerequisite naming a unit that does not exist is ignored rather than
 * treated as unmet. A typo in the content files must not be able to strand a
 * learner on a unit they can never unlock.
 */
function prereqsMet(unit: Unit, done: Set<string>, known: Set<string>): boolean {
  let ids: unknown;
  try {
    ids = JSON.parse(unit.prereq_json);
  } catch {
    return true; // malformed content is not the learner's problem
  }
  if (!Array.isArray(ids)) return true;
  return ids.every((id) => typeof id !== "string" || !known.has(id) || done.has(id));
}

/**
 * The current unit — searched across the WHOLE course, not just one level.
 *
 * This used to look only inside `level`, and nothing anywhere ever changed
 * `user.level` from its default. The effect was that finishing A1.1 left the
 * learner permanently on the last A1.1 unit: 100 of the 120 units, and every
 * word above A1.1, were unreachable from the daily session. All that content
 * was in the database the whole time.
 *
 * Finishing a level now promotes the learner to the next one, which is a real
 * event derived from completed units — not a guess about their ability.
 */
export function currentUnit(userId: string, level: string): Unit | null {
  const start = Math.max(0, LEVELS.indexOf(level as (typeof LEVELS)[number]));
  const done = completedUnits(userId);
  const known = new Set(all<{ id: string }>("SELECT id FROM unit").map((r) => r.id));

  /* Two passes. The first honours prerequisites; the second ignores them.
     Prerequisites form a linear chain, so one unmet link strands every unit
     after it — and without the second pass the walk fell through to "the
     course is finished" and handed a beginner the last unit of B1.2. That is a
     far worse failure than ignoring a prerequisite: bad content data must
     never be able to end someone's course. The chain is correct today, so the
     second pass does not run. */
  for (const respectPrereqs of [true, false]) {
    for (let i = start; i < LEVELS.length; i++) {
      const lv = LEVELS[i];
      for (const u of unitsFor(lv)) {
        if (done.has(u.id)) continue;
        if (respectPrereqs && !prereqsMet(u, done, known)) continue;
        if (lv !== level) run("UPDATE user SET level = ? WHERE id = ?", lv, userId);
        return u;
      }
    }
  }

  // Every unit of every level really is done. Stay on the last one rather than
  // inventing a level beyond B1.2.
  const last = unitsFor(LEVELS[LEVELS.length - 1]);
  return last[last.length - 1] ?? null;
}

/**
 * Where your current pace lands you.
 *
 * Arithmetic on completed units and nothing else: units finished, days since
 * the first one, remaining units, a date. It is explicitly NOT a claim that
 * you will be B1.2 in March — it is the answer to "if I keep going exactly
 * like this, when do I run out of course", which is a question about the
 * calendar rather than about your German.
 *
 * Returns null until there is enough history to divide by, because a
 * projection from two days of data is a guess wearing a date.
 */
export function paceProjection(userId: string) {
  const row = get<{ done: number; first: string | null }>(
    `SELECT COUNT(*) AS done, MIN(completed_at) AS first
       FROM unit_progress WHERE user_id = ? AND status = 'complete'`,
    userId,
  );
  const done = row?.done ?? 0;
  const total = get<{ n: number }>("SELECT COUNT(*) AS n FROM unit")?.n ?? 0;
  if (!row?.first || done < 3 || done >= total) return null;

  const days = Math.max(
    1,
    Math.round((Date.now() - new Date(row.first.replace(" ", "T") + "Z").getTime()) / 86_400_000),
  );
  const perWeek = (done / days) * 7;
  if (perWeek <= 0) return null;

  const remaining = total - done;
  const weeksLeft = remaining / perWeek;
  const finish = new Date(Date.now() + weeksLeft * 7 * 86_400_000);

  return {
    done,
    total,
    remaining,
    days,
    perWeek: Math.round(perWeek * 10) / 10,
    weeksLeft: Math.round(weeksLeft),
    finish: finish.toISOString().slice(0, 10),
  };
}

/** How many units this level has — for "Unit 3 von 20" without hardcoding 20. */
export function unitCount(level: string): number {
  return (
    get<{ n: number }>("SELECT COUNT(*) AS n FROM unit WHERE level = ?", level)?.n ?? 0
  );
}

/**
 * Words in this unit the learner has still never been shown.
 *
 * A day introduces at most 12 new words (fewer if the pace was cut), but four
 * units hold more than that — Zahlen has 16, the final B1.2 unit has 22. The
 * unit used to be marked complete at the end of the session regardless, and
 * `currentUnit` skips completed units, so those 20 words were silently dropped
 * from the course and could only be found by hand in Wortschatz.
 */
export function unseenInUnit(userId: string, unitId: string): number {
  const unit = get<{ word_ids_json: string }>(
    "SELECT word_ids_json FROM unit WHERE id = ?",
    unitId,
  );
  if (!unit) return 0;
  const ids: string[] = JSON.parse(unit.word_ids_json);
  return unseenWords(userId, ids).length;
}

/**
 * Units the learner finished at least a week ago.
 *
 * Words and grammar rules come back on a forgetting curve; situations never
 * did. You did the café in unit 8 and the app never mentioned it again, which
 * is exactly backwards — a scenario is the slowest thing to build and the
 * fastest to lose, and it is the part you would actually use in Germany.
 *
 * A week's delay so a unit finished yesterday is not "revision" — that is
 * still the same lesson. Oldest completion first, so the rotation below starts
 * with whatever has been sitting untouched the longest.
 */
export function pastUnits(userId: string): Unit[] {
  return all<Unit>(
    `SELECT u.* FROM unit_progress p JOIN unit u ON u.id = p.unit_id
      WHERE p.user_id = ? AND p.status = 'complete'
        AND p.completed_at < datetime('now', '-7 days')
      ORDER BY p.completed_at`,
    userId,
  );
}

/**
 * Pick one past unit, rotating by day.
 *
 * Deterministic rather than random, for the same reason the rest of the
 * session is: reloading the page must not hand you a different revision. With
 * n finished units each comes back every n days, so the interval stretches as
 * the course goes on — which is roughly what you want from old material, and
 * is honest about being a rotation rather than a second forgetting curve.
 */
function rotate<T>(items: T[], dayIndex: number): T | undefined {
  return items.length ? items[dayIndex % items.length] : undefined;
}

export function markUnitComplete(userId: string, unitId: string) {
  run(
    `INSERT INTO unit_progress (user_id, unit_id, status, completed_at)
     VALUES (?, ?, 'complete', datetime('now'))
     ON CONFLICT(user_id, unit_id) DO UPDATE
       SET status='complete', completed_at=datetime('now')`,
    userId,
    unitId,
  );
}

/** Every word the learner has met — the whitelist for the AI (spec §8). */
export function knownVocabulary(userId: string): string[] {
  return all<{ lemma: string }>(
    `SELECT w.lemma FROM card c JOIN word w ON w.id = c.ref_id
      WHERE c.user_id = ? AND c.ref_type = 'word' AND c.reps > 0
      ORDER BY w.freq_rank`,
    userId,
  ).map((r) => r.lemma);
}

// ---------------------------------------------------------------- gap detection

/**
 * Has the user seen new vocabulary today? Spec §3 — new vocab and new grammar
 * never share a day, because two novel cognitive loads halve retention of both.
 */
function introducedToday(userId: string, kind: "vocab" | "grammar") {
  const n =
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM attempt
        WHERE user_id = ? AND kind = ? AND date(created_at) = date('now')`,
      userId,
      kind === "vocab" ? "new-vocab" : "new-grammar",
    )?.n ?? 0;
  return n > 0;
}

function daysSinceLastSession(userId: string): number {
  const row = get<{ d: number }>(
    `SELECT CAST(julianday('now') - julianday(MAX(date)) AS INTEGER) AS d
       FROM session_log WHERE user_id = ?`,
    userId,
  );
  return row?.d ?? 0;
}

// ---------------------------------------------------------------- the builder

export type SessionPlan = {
  unit: Unit | null;
  canDo: string[];
  blocks: Block[];
  totalMinutes: number;
  mode: "normal" | "wiedereinstieg";
  dueTotal: number;
  /** The level after any promotion this build triggered — may differ from the
      one passed in, so callers must report THIS rather than their stale copy. */
  level: string;
  /** Units in that level, so the UI never hardcodes a count. */
  unitsInLevel: number;
  /** Set when the new-word count was cut, with the accuracy that caused it. */
  pacing: { words: number; accuracy: number | null; reduced: boolean };
  /**
   * What comes after this unit, by name.
   *
   * The recap said "Morgen: Unit 15", which spec §4 forbids in as many words:
   * never show a bare unit number, because a number is not a reason to come
   * back and "Im Restaurant" is.
   */
  next: { ord: number; title: string } | null;
};

/**
 * "short" runs only the parts that decay: reviews, Fix, Lücken, grammar.
 *
 * This bends "one button, no decisions" and it is the right trade. The session
 * is an hour; some days you have fifteen minutes. Without an escape valve the
 * only options are abandon it mid-way — losing the streak and leaving cards
 * ungraded — or skip the day entirely. A valve used twice a month beats a
 * broken streak twice a month.
 */
export type SessionMode = "full" | "short";

/**
 * Build today's session.
 *
 * Two shapes: the normal six-block rhythm, and Wiedereinstieg (spec §15) after
 * a gap of 3+ days — reviews only, hard-capped, no new material, and it says so.
 * Coming back to 300 due cards is what kills SRS apps.
 */
export function buildSession(
  userId: string,
  level = "A1.1",
  shape: SessionMode = "full",
): SessionPlan {
  const gap = daysSinceLastSession(userId);
  const total = dueCount(userId);
  const unit = currentUnit(userId, level);
  const canDo: string[] = unit ? JSON.parse(unit.can_do_json) : [];
  // currentUnit may have promoted the learner, so read the level off the unit
  // it actually returned rather than trusting the argument.
  const atLevel = unit?.level ?? level;
  const unitsInLevel = unitCount(atLevel);
  const pacing = newWordBudget(userId);

  /* The next unit by name. Looked up across levels rather than by ord+1, so
     the last unit of a level points at the first of the next one instead of
     nowhere. Null only at the very end of B1.2. */
  const next = unit
    ? (get<{ ord: number; title: string }>(
        `SELECT ord, title FROM unit
          WHERE (level = ? AND ord > ?) OR level > ?
          ORDER BY level, ord LIMIT 1`,
        unit.level,
        unit.ord,
        unit.level,
      ) ?? null)
    : null;

  if (gap >= 3 && total > 40) {
    return {
      unit,
      canDo: [],
      mode: "wiedereinstieg",
      dueTotal: total,
      level: atLevel,
      unitsInLevel,
      next,
      pacing,
      totalMinutes: 15,
      blocks: [
        {
          kind: "review",
          title: "Wiedereinstieg",
          minutes: 15,
          offline: true,
          skippable: false,
          payload: { cards: dueCards(userId, 20), capped: true, backlog: total, gap },
        },
      ],
    };
  }

  const blocks: Block[] = [];

  /* Rotates the input and output blocks day to day so the rhythm stays fixed
     while the content varies. The decisions themselves live in lib/rhythm.ts,
     pure and testable; this file only carries them out. */
  const dayIndex = today();
  const older = pastUnits(userId);

  // 1. Aufwärmen — always first, never skippable.
  //
  //    Every third day it runs audio-first: same cards, same grading, the word
  //    hidden until you've answered. Listening is the skill that lags when all
  //    your practice is on the page, and this is the cheapest possible fix for
  //    it. Rotated rather than offered as a setting — the session doesn't ask.
  const due = dueCards(userId, REVIEW_CAP);
  if (due.length) {
    blocks.push({
      kind: "review",
      title: dayIndex % 3 === 1 ? "Nur Hören" : "Aufwärmen",
      minutes: 12,
      offline: true,
      skippable: false,
      payload: {
        cards: due,
        capped: total > REVIEW_CAP,
        backlog: total,
        audioFirst: rhythmFor(dayIndex, { video: false, reading: false }).audioFirstReview,
      },
    });
  }

  // 2. Fix — your top three mistakes. Skipped entirely if you have none.
  const tags = topErrorTags(userId);
  if (tags.length) {
    blocks.push({
      kind: "fix",
      title: "Fix",
      minutes: 5,
      offline: true,
      skippable: true,
      payload: { tags, drills: drillsForTags(tags.map((t) => t.tag)) },
    });
  }

  // 2b. Lücken — sentences mined from this learner's own wrong answers and
  //     from lines they tapped while reading. Mining runs here, on every build,
  //     so yesterday's mistake is today's card with nobody having to ask.
  mineFromErrors(userId);
  const gaps = dueCloze(userId, 8);
  if (gaps.length) {
    blocks.push({
      kind: "cloze",
      title: "Lücken",
      minutes: 6,
      offline: true,
      skippable: true,
      payload: { cards: gaps },
    });
  }

  // 2c. Grammatik-Wiederholung — rules that are due back, same curve as words.
  const grammarDue = dueGrammar(userId, 3);
  if (grammarDue.length) {
    blocks.push({
      kind: "grammar-review",
      title: "Grammatik-Wdh.",
      minutes: 5,
      offline: true,
      skippable: true,
      payload: { cards: grammarDue },
    });
  }

  /* A short session stops here: everything above decays if you skip it, and
     everything below is new material that can simply wait for tomorrow. */
  if (shape === "short") {
    return {
      unit,
      canDo,
      blocks,
      mode: "normal",
      dueTotal: total,
      level: atLevel,
      unitsInLevel,
      next,
      pacing,
      totalMinutes: blocks.reduce((n, b) => n + b.minutes, 0),
    };
  }

  // 3. Neu — vocab OR grammar, never both in one day.
  if (unit) {
    const wordIds: string[] = JSON.parse(unit.word_ids_json);
    const fresh = unseenWords(userId, wordIds).slice(0, pacing.words);
    const grammar = unit.grammar_id
      ? get<Grammar>("SELECT * FROM grammar WHERE id = ?", unit.grammar_id)
      : undefined;

    const didVocab = introducedToday(userId, "vocab");
    const didGrammar = introducedToday(userId, "grammar");

    if (fresh.length && !didVocab && !didGrammar) {
      blocks.push({
        kind: "new-vocab",
        title: "Neue Wörter",
        minutes: 15,
        offline: true,
        skippable: false,
        payload: { words: fresh, unit: unit.title, pacing },
      });
    } else if (grammar && !didGrammar && !didVocab) {
      blocks.push({
        kind: "new-grammar",
        title: "Grammatik",
        minutes: 15,
        offline: true,
        skippable: false,
        payload: { grammar, examples: JSON.parse(grammar.examples_json), drills: JSON.parse(grammar.drills_json) },
      });
    }
  }

  // 4. Input — video, reading or listening. Video needs the network, so when
  //    it's chosen offline the runner swaps in the audio drill instead.
  const unitWords = unit ? wordsIn(JSON.parse(unit.word_ids_json)) : [];
  const video = unit?.video_id
    ? get<{
        id: string;
        youtube_id: string;
        src_url: string | null;
        title: string;
        channel: string | null;
        segments_json: string;
      }>(
        "SELECT id, youtube_id, src_url, title, channel, segments_json FROM video WHERE id = ?",
        unit.video_id,
      )
    : undefined;
  // Only offer a video once it actually has hand-marked segments — an
  // unsegmented file or embed is a video, not a lesson.
  const videoReady = Boolean(
    video && (JSON.parse(video.segments_json) as unknown[]).length > 0,
  );
  const recyclable = older.filter((u) => u.reading_id);
  const rhythm = rhythmFor(dayIndex, {
    video: videoReady,
    reading: Boolean(unit?.reading_id || recyclable.length),
  });

  /* On a recycle day, read something from a unit you finished a while back
     instead of this unit's text. The current text is tied to words you met this
     week and is therefore the easy one; the old text is the honest test of
     whether any of it stuck. */
  const oldReadingUnit = rhythm.recycleReading ? rotate(recyclable, dayIndex) : undefined;
  const readingId = oldReadingUnit?.reading_id ?? unit?.reading_id;
  const reading = readingId
    ? get<{
        id: string;
        title: string;
        body: string;
        word_count: number;
        questions_json: string;
        glossary_json: string;
      }>("SELECT * FROM reading WHERE id = ?", readingId)
    : undefined;

  if (videoReady && rhythm.input === "video") {
    blocks.push({
      kind: "video",
      title: "Video",
      minutes: 15,
      offline: false,
      skippable: true,
      payload: {
        id: video!.id,
        youtubeId: video!.youtube_id,
        srcUrl: video!.src_url,
        title: video!.title,
        channel: video!.channel,
        segments: JSON.parse(video!.segments_json),
        // Shipped with the block so going offline mid-session costs no round
        // trip — the runner just renders this instead (spec §17).
        fallback: {
          kind: "listening",
          payload: { items: listeningItems(unitWords, atLevel, dayIndex) },
        },
      },
    });
  } else if (reading && rhythm.input === "reading") {
    blocks.push({
      kind: "reading",
      // Named so the learner knows why an old text turned up, rather than
      // wondering whether the app has lost its place.
      title: oldReadingUnit ? "Wiederlesen" : "Lesen",
      minutes: 15,
      offline: true,
      skippable: true,
      payload: {
        id: reading.id,
        title: reading.title,
        body: reading.body,
        wordCount: reading.word_count,
        questions: JSON.parse(reading.questions_json),
        glossary: JSON.parse(reading.glossary_json),
        from: oldReadingUnit ? `Unit ${oldReadingUnit.ord} · ${oldReadingUnit.title}` : null,
      },
    });
  } else if (unitWords.length) {
    blocks.push({
      kind: "listening",
      title: "Hören",
      minutes: 15,
      offline: true,
      skippable: true,
      payload: { items: listeningItems(unitWords, atLevel, dayIndex) },
    });
  }

  // 5. Output — builder is the offline-safe default; conversation needs network.
  if (unitWords.length) {
    blocks.push({
      kind: "builder",
      title: "Sätze bauen",
      minutes: 12,
      offline: true,
      skippable: true,
      payload: { items: builderItems(unit!, unitWords, atLevel, dayIndex) },
    });
  }

  // Spoken or written, rotated by day. See rhythm.ts for the split and why.
  if (rhythm.output === "speaking" && unitWords.length) {
    blocks.push({
      kind: "speaking",
      title: "Sprechen",
      minutes: 8,
      offline: true, // Web Speech runs in the browser
      skippable: true,
      payload: { items: listeningItems(unitWords, atLevel, dayIndex).slice(0, 5) },
    });
  } else if (unit) {
    blocks.push({
      kind: "writing",
      title: "Schreiben",
      minutes: 10,
      offline: true, // queued offline, corrected on reconnect (spec §17)
      skippable: true,
      payload: {
        prompt: writingPrompt(unit),
        hint: `Benutze Wörter aus „${unit.title}".`,
        minWords: 15,
      },
    });
  }

  /* Every third session the conversation is one you have had before, from a
     unit finished over a week ago. This is the block that most needed it: a
     scenario is ten minutes of the hardest thing in the course, and doing each
     one exactly once is how you end up able to order coffee in unit 8 and not
     in month five. */
  const oldScenarioUnit = rhythm.recycleScenario
    ? rotate(older.filter((u) => u.scenario_json), dayIndex)
    : undefined;
  const talkUnit = oldScenarioUnit ?? unit;

  if (talkUnit?.scenario_json) {
    blocks.push({
      kind: "conversation",
      title: oldScenarioUnit ? "Nochmal sprechen" : "Gespräch",
      minutes: 10,
      offline: false, // falls back to the scripted dialogue below
      skippable: true,
      payload: {
        scenario: JSON.parse(talkUnit.scenario_json),
        dialogue: talkUnit.dialogue_json ? JSON.parse(talkUnit.dialogue_json) : null,
        unitId: talkUnit.id,
        from: oldScenarioUnit ? `Unit ${oldScenarioUnit.ord} · ${oldScenarioUnit.title}` : null,
      },
    });
  }

  // 6. Abschluss — quiz on today only, then the recap.
  blocks.push({
    kind: "quiz",
    title: "Abschluss",
    minutes: 4,
    offline: true,
    skippable: false,
    payload: { unitId: unit?.id ?? null },
  });

  return {
    unit,
    canDo,
    blocks,
    mode: "normal",
    dueTotal: total,
    level: atLevel,
    unitsInLevel,
    next,
    pacing,
    totalMinutes: blocks.reduce((n, b) => n + b.minutes, 0),
  };
}

// ---------------------------------------------------------------- generators

/**
 * Extra sentences from the corpus, at or below the learner's level.
 *
 * Every one was filtered at import time to use only vocabulary this course
 * teaches, so the constraint that governs the AI tutor (spec §8) holds here
 * too. Rotated by day so the same eight don't repeat all week.
 */
function corpusSentences(level: string, dayIndex: number, limit: number) {
  const levels = LEVELS.slice(0, Math.max(1, LEVELS.indexOf(level as (typeof LEVELS)[number]) + 1));
  const ph = levels.map(() => "?").join(",");

  /*
   * A window that moves by one page a day.
   *
   * It used to be a cursor over the id: `id > 'tat-' + (dayIndex % 36)`, base
   * 36, "walks the whole corpus over time instead of replaying the first rows".
   * It did not. Two things broke it. The modulo made day 36 identical to day 0,
   * so the walk stopped after five weeks of a seven-month course. And Tatoeba
   * ids are wildly skewed — 941 of the 1,827 sentences start with `tat-1` — so
   * the 36 landing points were not spread across the corpus at all.
   *
   * Measured over 210 days: the old cursor reached 105 of 1,827 sentences at
   * B1.2 (6%) and 102 of 400 at A1.1, and both numbers were already final on
   * day 36. This reaches 92% and 100% respectively. Listening and Sätze bauen
   * were quietly drilling the same hundred sentences for months.
   */
  const total =
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM sentence WHERE level IN (${ph})`, ...levels)?.n ??
    0;
  if (!total) return [];

  const offset = (dayIndex * limit) % total;
  const rows = all<{ id: string; de: string; en: string; source: string | null }>(
    `SELECT id, de, en, source FROM sentence
      WHERE level IN (${ph}) ORDER BY id LIMIT ? OFFSET ?`,
    ...levels,
    limit,
    offset,
  );

  // Wrap round rather than returning a short block on the last page.
  if (rows.length < limit) {
    rows.push(
      ...all<{ id: string; de: string; en: string; source: string | null }>(
        `SELECT id, de, en, source FROM sentence
          WHERE level IN (${ph}) ORDER BY id LIMIT ?`,
        ...levels,
        limit - rows.length,
      ),
    );
  }
  return rows;
}

/**
 * Listening items: hear it, type it.
 *
 * The unit's own curated examples come first — they use the words being taught
 * today — then corpus sentences fill the block out. Before the corpus import
 * this block could only ever offer as many items as the unit had example
 * sentences, which was often three.
 */
function listeningItems(words: Word[], level: string, dayIndex: number) {
  const curated = words
    .filter((w) => w.example_de)
    .slice(0, 5)
    .map((w) => ({
      wordId: w.id,
      de: w.example_de!,
      en: w.example_en ?? "",
      audio: w.audio_url,
      credit: null as string | null,
    }));

  const extra = corpusSentences(level, dayIndex, 8 - curated.length).map((s) => ({
    wordId: s.id,
    de: s.de,
    en: s.en,
    audio: null,
    credit: s.source,
  }));

  return [...curated, ...extra];
}

/**
 * Sentence-builder items. Uses the unit's curated example sentences so every
 * tile is a word the learner has met — the vocabulary constraint applies to
 * generated exercises too, not just the AI.
 */
function builderItems(unit: Unit, words: Word[], level: string, dayIndex: number) {
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
  const extra = corpusSentences(level, dayIndex + 7, 8 - curated.length).map((s) =>
    make(s.id, s.de, s.en, s.source),
  );

  return [...curated, ...extra];
}

/**
 * Fix-block drills: pull grammar drills whose point matches the failing tag.
 *
 * Deliberately NOT filtered by level — if you're still getting Akkusativ wrong
 * at B1, you should get the A1.2 drill back. The tag says what you need, not
 * where you happen to be in the course.
 */
function drillsForTags(tags: string[]) {
  /* Every tag the classifier can produce needs a row here, or the Fix block
     silently has nothing to drill for it. The four new ones — dative, genitive,
     the perfect auxiliary and prepositions — arrived with the prebuilt error
     patterns, and all four already had a grammar point written. */
  const TAG_TO_SLUG: Record<string, string[]> = {
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
    (JSON.parse(r.drills_json) as { q: string; options: string[]; a: number; why: string }[])
      .slice(0, 3)
      .map((d) => ({ ...d, from: r.title, slug: r.slug })),
  );
}

/** A writing prompt tied to the unit's own can-do statements. */
function writingPrompt(unit: Unit): string {
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
    (canDo.length ? `Schreib ein paar Sätze: ${canDo[0]}.` : `Schreib über „${unit.title}".`)
  );
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------- logging

/**
 * Record a finished session and return the streak it leaves behind.
 *
 * Two small changes, neither of them urgent, both of them removing a way for
 * the number on the recap to differ from the number in the database.
 *
 * It returned the streak it had just COMPUTED. The ON CONFLICT branch
 * deliberately does not touch streak_day — a second session today must not
 * advance the streak — so on an upsert the returned value and the stored value
 * come from different places. They agree in normal operation, because both
 * derive from yesterday's row. They stop agreeing if today's row came from
 * anywhere else: a restored backup, an import, a clock that moved. It reads the
 * row back now, so what is shown is what is stored, always.
 *
 * And read and write are one transaction. Nothing can interleave here today —
 * this function and `node:sqlite` are both synchronous — but a second process
 * against the same file, or one `await` added later, would make the gap real.
 */
export function logSession(userId: string, minutes: number, blocks: string[]) {
  return tx(() => {
    const yesterday = get<{ streak_day: number }>(
      `SELECT streak_day FROM session_log
        WHERE user_id = ? AND date = date('now','-1 day')`,
      userId,
    );
    run(
      `INSERT INTO session_log (user_id, date, minutes, blocks_json, streak_day)
       VALUES (?, date('now'), ?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE
         SET minutes = minutes + excluded.minutes,
             blocks_json = excluded.blocks_json`,
      userId,
      minutes,
      JSON.stringify(blocks),
      (yesterday?.streak_day ?? 0) + 1,
    );
    return (
      get<{ streak_day: number }>(
        "SELECT streak_day FROM session_log WHERE user_id = ? AND date = date('now')",
        userId,
      )?.streak_day ?? 1
    );
  });
}

export function currentStreak(userId: string): number {
  return (
    get<{ n: number }>(
      "SELECT streak_day AS n FROM session_log WHERE user_id = ? ORDER BY date DESC LIMIT 1",
      userId,
    )?.n ?? 0
  );
}
