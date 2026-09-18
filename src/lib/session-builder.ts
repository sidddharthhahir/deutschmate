import { get } from "./db";
import { dueCards, dueCount } from "./srs";
import { topErrorTags, reasonForTags } from "./errors";
import { dueCloze, mineFromErrors } from "./cloze";
import { rhythmFor, today } from "./rhythm";
import { dueGrammar } from "./grammar-srs";
import { reachOf } from "./sentence-grammar";
import { hasHearts } from "./gamification";
import {
  CLOZE_PER_SESSION,
  GAP_BACKLOG,
  GAP_CARDS,
  GAP_DAYS,
  REVIEW_CAP,
} from "@/lib/config";
import type { Block, Grammar, SessionMode, SessionPlan } from "./session-types";
import {
  currentUnit,
  daysSinceLastSession,
  introducedToday,
  pastUnits,
  rotate,
  unitCount,
  unseenWords,
  wordsIn,
} from "./session-progression";
import { newWordBudget } from "./session-pacing";
import {
  builderItems,
  conversationRepeatCount,
  drillsForTags,
  listeningItems,
  safeJson,
  writingPrompt,
} from "./session-content";

/**
 * Build today's session. Two shapes: the normal six-block rhythm, and Wiedereinstieg (spec §15)
 * after a gap of 3+ days — reviews only, hard-capped, no new material, and it says so.
 */
export function buildSession(
  userId: string,
  level = "A1.1",
  shape: SessionMode = "full",
  /*
   * Which day's rhythm to build. Defaults to the real one — this exists so a
   * developer can look at Lesen or Schreiben without waiting three days for
   * the rotation to come round, and the API only honours it outside
   * production. It changes which blocks appear, never what is recorded.
   */
  dayOverride?: number,
): SessionPlan {
  const gap = daysSinceLastSession(userId);
  /* A gap of one is yesterday's session and nothing missed; two is one lost
     day. Reported on the plan so the home screen can say why today is longer,
     instead of leaving a learner to compare "66 min" with "88 min". */
  const missed = Math.max(0, gap - 1);
  const total = dueCount(userId);
  const unit = currentUnit(userId, level);
  const canDo: string[] = unit ? JSON.parse(unit.can_do_json) : [];
  // currentUnit may have promoted the learner, so read the level off the unit
  // it actually returned rather than trusting the argument.
  const atLevel = unit?.level ?? level;
  const unitsInLevel = unitCount(atLevel);
  const pacing = newWordBudget(userId);
  /* How far into A1 the learner has got, for the sentence gate. No unit means
     an empty course, and 1 keeps a broken database from serving everything. */
  const reach = unit ? reachOf(unit.level, unit.ord) : 1;
  const heartsEmpty = !hasHearts(userId);
  // Unit 1 only: skip Builder/Speaking/Gespräch until unit 2 — day one keeps
  // to receptive input (video/reading/listening) plus the quiz.
  const easeIn = unit?.ord === 1;

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

  if (gap >= GAP_DAYS && total > GAP_BACKLOG) {
    return {
      unit,
      canDo: [],
      mode: "wiedereinstieg",
      dueTotal: total,
      level: atLevel,
      unitsInLevel,
      next,
      pacing,
      missed,
      heartsEmpty,
      totalMinutes: 15,
      blocks: [
        {
          kind: "review",
          title: "Wiedereinstieg",
          minutes: 15,
          offline: true,
          skippable: false,
          payload: {
            cards: dueCards(userId, GAP_CARDS),
            capped: true,
            backlog: total,
            gap,
          },
        },
      ],
    };
  }

  const blocks: Block[] = [];

  // 0. Aussprache-Basics — once ever, unit 1 only, reusing the new-grammar
  // block kind. Gated on the card existing (not "today"), so it never repeats.
  if (easeIn) {
    const primerSeen = get<{ id: number }>(
      "SELECT id FROM card WHERE user_id = ? AND ref_type = 'grammar' AND ref_id = 'g-aussprache'",
      userId,
    );
    if (!primerSeen) {
      const primer = get<Grammar>(
        "SELECT * FROM grammar WHERE id = 'g-aussprache'",
      );
      if (primer) {
        blocks.push({
          kind: "new-grammar",
          title: "Aussprache-Basics",
          minutes: 6,
          offline: true,
          skippable: false,
          payload: {
            grammar: primer,
            examples: JSON.parse(primer.examples_json),
            drills: JSON.parse(primer.drills_json),
          },
        });
      }
    }
  }

  /* Rotates the input and output blocks day to day so the rhythm stays fixed
     while the content varies. The decisions themselves live in lib/rhythm.ts,
     pure and testable; this file only carries them out. */
  const dayIndex = dayOverride ?? today();
  const older = pastUnits(userId);

  // 1. Aufwärmen — first except for the one-time primer above, never skippable.
  const due = dueCards(userId, REVIEW_CAP);
  if (due.length) {
    blocks.push({
      kind: "review",
      /* "Nur Hören" collided with the listening block, "Hören", which follows
         it on exactly the days it appears — two adjacent blocks with almost
         the same name doing different things. It is still the warm-up; the
         bracket says how it is done today. */
      title: dayIndex % 3 === 1 ? "Aufwärmen (Hören)" : "Aufwärmen",
      minutes: 12,
      offline: true,
      skippable: false,
      payload: {
        cards: due,
        capped: total > REVIEW_CAP,
        backlog: total,
        audioFirst: rhythmFor(dayIndex, { video: false, reading: false })
          .audioFirstReview,
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
      payload: {
        tags,
        drills: drillsForTags(tags.map((t) => t.tag)),
        reason: reasonForTags(tags),
      },
    });
  }

  // 2b. Lücken — sentences mined from this learner's own wrong answers and
  //     from lines they tapped while reading. Mining runs here, on every build,
  //     so yesterday's mistake is today's card with nobody having to ask.
  mineFromErrors(userId, reach);
  const gaps = dueCloze(userId, CLOZE_PER_SESSION);
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
      missed,
      heartsEmpty,
      totalMinutes: blocks.reduce((n, b) => n + b.minutes, 0),
    };
  }

  // 3. Neu — vocab OR grammar, never both in one day, and never with no hearts
  //    left. Hearts gate new material only — everything above this line (due
  //    reviews, Fix, Lücken, Grammatik-Wdh.) is unaffected, and everything
  //    below (input/output/quiz) still runs on today's already-known words.
  if (unit && !heartsEmpty) {
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
        payload: {
          grammar,
          examples: JSON.parse(grammar.examples_json),
          drills: JSON.parse(grammar.drills_json),
        },
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
  /*
   * A video needs a playable source, and that is all it needs.
   *
   * This used to require hand-marked segments too, on the reasoning that an
   * unsegmented file is a video and not a lesson. The reasoning was wrong in
   * one specific way and the consequence was total: 231 Nicos Weg episodes are
   * imported, every one of them has no segments, so the block had never once
   * been shown to anybody. Reported as "I don't find the youtube video player",
   * which is the only way it could have been reported.
   *
   * A ninety-second episode of a Deutsche Welle drama course, written for this
   * level and attached to this unit, is a lesson. Segments add per-sentence
   * replay on top of it — worth having, not the substance. VideoBlock already
   * renders the unsegmented case; nothing but this line was in the way.
   */
  /* The same rule as lib/player.ts sourceOf(), written out rather than
     imported: that module is "use client" and pulls in the YouTube API loader,
     which has no business being evaluated on the server. */
  const videoReady = Boolean(video && (video.src_url || video.youtube_id));
  const recyclable = older.filter((u) => u.reading_id);
  const rhythm = rhythmFor(dayIndex, {
    video: videoReady,
    reading: Boolean(unit?.reading_id || recyclable.length),
  });

  /*
   * On a recycle day, read something from a unit you finished a while back
   * instead of this unit's text. The current text is tied to words you met this
   * week and is therefore the easy one; the old text is the honest test of
   * whether any of it stuck.
   *
   * Also when this unit simply has no text — only fourteen of the forty A1
   * units have one. The rotation was told reading was available because an OLD
   * unit had a text, then this line looked only at the current unit, found
   * nothing, and the session quietly fell through to listening. Asking for a
   * reading day and getting a listening block is the rotation lying about
   * itself; borrowing an old text is what "reading is available" meant.
   */
  const oldReadingUnit =
    rhythm.input === "reading" && (rhythm.recycleReading || !unit?.reading_id)
      ? rotate(recyclable, dayIndex)
      : undefined;
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
          payload: {
            items: listeningItems(unitWords, atLevel, reach, dayIndex),
          },
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
        from: oldReadingUnit
          ? `Unit ${oldReadingUnit.ord} · ${oldReadingUnit.title}`
          : null,
      },
    });
  } else if (unitWords.length) {
    blocks.push({
      kind: "listening",
      title: "Hören",
      minutes: 15,
      offline: true,
      skippable: true,
      payload: { items: listeningItems(unitWords, atLevel, reach, dayIndex) },
    });
  }

  // 5. Output — builder is the offline-safe default; conversation needs network.
  //    Skipped entirely on unit 1 — see easeIn above.
  if (!easeIn && unitWords.length) {
    blocks.push({
      kind: "builder",
      title: "Sätze bauen",
      minutes: 12,
      offline: true,
      skippable: true,
      payload: {
        items: builderItems(unit!, unitWords, atLevel, reach, dayIndex),
      },
    });
  }

  // Spoken or written, rotated by day. See rhythm.ts for the split and why.
  if (easeIn) {
    // neither — unit 1 stops at the quiz below
  } else if (rhythm.output === "speaking" && unitWords.length) {
    blocks.push({
      kind: "speaking",
      title: "Sprechen",
      minutes: 8,
      offline: true, // Web Speech runs in the browser
      skippable: true,
      payload: {
        items: listeningItems(unitWords, atLevel, reach, dayIndex).slice(0, 5),
      },
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

  /*
   * Every third session the conversation is one you have had before, from a unit finished over a
   * week ago.
   */
  const oldScenarioUnit = rhythm.recycleScenario
    ? rotate(
        older.filter((u) => u.scenario_json),
        dayIndex,
      )
    : undefined;
  const talkUnit = oldScenarioUnit ?? unit;

  /*
   * Parse before deciding, not after. `scenario_json` holding the four
   * characters "null" is truthy, so this pushed a Gespräch block for every unit
   * that has no scenario — all forty of A1 — and the block then read .role off
   * the parsed null and took the whole session down with it.
   */
  const scenario = safeJson<{ role?: string }>(talkUnit?.scenario_json);
  if (!easeIn && scenario?.role) {
    blocks.push({
      kind: "conversation",
      title: oldScenarioUnit ? "Nochmal sprechen" : "Gespräch",
      minutes: 10,
      offline: false, // falls back to the scripted dialogue below
      skippable: true,
      payload: {
        scenario,
        dialogue: safeJson(talkUnit!.dialogue_json),
        unitId: talkUnit!.id,
        from: oldScenarioUnit
          ? `Unit ${oldScenarioUnit.ord} · ${oldScenarioUnit.title}`
          : null,
        repetition: conversationRepeatCount(userId, talkUnit!.id),
        userId,
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
    missed,
    heartsEmpty,
    totalMinutes: blocks.reduce((n, b) => n + b.minutes, 0),
  };
}
