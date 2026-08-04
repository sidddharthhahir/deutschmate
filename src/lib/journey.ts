import { all, get } from "./db";
import { LEVELS } from "./session";

/**
 * The road behind and the road ahead.
 *
 * Fortschritt answers "how am I doing this month". This answers the two
 * questions it can't: how far is it to the end, and how far have I come. Both
 * are motivating in a way a 30-day accuracy figure is not — people remember
 * the day they first held a conversation, not that their retention was 87%.
 *
 * Principle 4 still applies, and it applies hardest here, because a page about
 * how far you have come is exactly where an app would be tempted to inflate.
 * Every row below is a stored event with a real date on it: a unit you
 * finished, a word you were introduced to, an exam you sat. Nothing is
 * estimated, nothing is a badge for showing up, and a milestone you have not
 * reached does not appear greyed out to bait you — it is simply not there yet.
 */

// ------------------------------------------------------------------ roadmap

export type UnitTick = {
  id: string;
  ord: number;
  title: string;
  done: boolean;
  current: boolean;
};

export type LevelRow = {
  level: string;
  units: UnitTick[];
  done: number;
  total: number;
  /** When the last unit of this level was completed, if it is finished. */
  finishedAt: string | null;
};

/**
 * Every unit in the course, marked done / current / ahead.
 *
 * One query for the units and one for the completions rather than a per-unit
 * `unitStatus()` call: 120 units meant 120 round trips, which is fine on
 * SQLite and still the wrong shape to leave in a page that renders on request.
 */
export function roadmap(userId: string, currentUnitId: string | null): LevelRow[] {
  const units = all<{ id: string; level: string; ord: number; title: string }>(
    "SELECT id, level, ord, title FROM unit ORDER BY level, ord",
  );
  const done = new Set(
    all<{ unit_id: string }>(
      "SELECT unit_id FROM unit_progress WHERE user_id = ? AND status = 'complete'",
      userId,
    ).map((r) => r.unit_id),
  );
  const finished = new Map(
    all<{ level: string; at: string }>(
      `SELECT u.level AS level, MAX(p.completed_at) AS at
         FROM unit_progress p JOIN unit u ON u.id = p.unit_id
        WHERE p.user_id = ? AND p.status = 'complete'
        GROUP BY u.level`,
      userId,
    ).map((r) => [r.level, r.at] as const),
  );

  return LEVELS.map((level) => {
    const mine = units.filter((u) => u.level === level);
    const ticks = mine.map((u) => ({
      id: u.id,
      ord: u.ord,
      title: u.title,
      done: done.has(u.id),
      current: u.id === currentUnitId,
    }));
    const n = ticks.filter((t) => t.done).length;
    return {
      level,
      units: ticks,
      done: n,
      total: ticks.length,
      /* Only a level with every unit behind it counts as finished. Sliced to a
         date because completed_at is a full datetime and the page formats
         dates — an unsliced value rendered as a raw "2026-07-15 07:10:19". */
      finishedAt:
        ticks.length && n === ticks.length
          ? (finished.get(level)?.slice(0, 10) ?? null)
          : null,
    };
  });
}

// ------------------------------------------------------------------- skills

export type Skill = { level: string; ord: number; title: string; items: string[] };

/**
 * What the learner can now do, in their own course's words.
 *
 * These are the can-do statements of finished units — "ask and understand a
 * price", not "420 words". A count says how much you have touched; a can-do
 * says what you could walk into a shop and manage, which is the thing anyone
 * actually wants to know about their own German.
 */
export function skillsEarned(userId: string): Skill[] {
  const rows = all<{ level: string; ord: number; title: string; can_do_json: string }>(
    `SELECT u.level, u.ord, u.title, u.can_do_json
       FROM unit_progress p JOIN unit u ON u.id = p.unit_id
      WHERE p.user_id = ? AND p.status = 'complete'
      ORDER BY u.level, u.ord`,
    userId,
  );
  return rows
    .map((r) => {
      let items: string[] = [];
      try {
        const parsed: unknown = JSON.parse(r.can_do_json);
        if (Array.isArray(parsed)) items = parsed.filter((x): x is string => typeof x === "string");
      } catch {
        /* a unit with a malformed blob contributes nothing, rather than crashing the page */
      }
      return { level: r.level, ord: r.ord, title: r.title, items };
    })
    .filter((s) => s.items.length > 0);
}

// --------------------------------------------------------------- milestones

export type Milestone = {
  /** ISO date, "YYYY-MM-DD". */
  on: string;
  title: string;
  detail: string;
};

/** Word counts worth stopping at. The last is the whole deck. */
const WORD_MARKS = [1, 100, 250, 500, 1000, 1500, 2000, 2400];

/** The first time each of these happened is worth remembering. */
const FIRSTS: { kind: string; title: string; detail: string }[] = [
  { kind: "conversation", title: "Erstes Gespräch", detail: "auf Deutsch geantwortet" },
  { kind: "writing", title: "Erster eigener Text", detail: "selbst geschrieben, nicht abgeschrieben" },
  { kind: "reading", title: "Erster Lesetext", detail: "einen ganzen Text gelesen" },
  { kind: "speaking", title: "Zum ersten Mal gesprochen", detail: "laut, nicht getippt" },
];

/**
 * Dated events, oldest first.
 *
 * Everything here is derived from a row that already existed for another
 * reason — the attempt log, unit_progress, session_log, exam_run. Nothing is
 * written when a milestone is "earned", so there is no state to get out of
 * sync with the facts, and a restored backup shows the same history.
 */
export function milestones(userId: string): Milestone[] {
  const out: Milestone[] = [];
  const day = (ts: string) => ts.slice(0, 10);

  // Day one.
  const first = get<{ d: string }>(
    "SELECT MIN(date) AS d FROM session_log WHERE user_id = ?",
    userId,
  )?.d;
  if (first) out.push({ on: first, title: "Angefangen", detail: "erste Sitzung" });

  /* Words, by the date each was first introduced. A word introduced twice —
     which happens when a unit carries over — must count once, so this ranks
     distinct words by their earliest introduction rather than counting rows. */
  const intro = all<{ ref_id: string; at: string; lemma: string | null }>(
    `SELECT a.ref_id AS ref_id, MIN(a.created_at) AS at, w.lemma AS lemma
       FROM attempt a LEFT JOIN word w ON w.id = a.ref_id
      WHERE a.user_id = ? AND a.kind = 'new-vocab' AND a.ref_id IS NOT NULL
      GROUP BY a.ref_id
      ORDER BY at`,
    userId,
  );
  for (const mark of WORD_MARKS) {
    const row = intro[mark - 1];
    if (!row) break;
    out.push(
      mark === 1
        ? {
            on: day(row.at),
            title: "Erstes Wort",
            detail: row.lemma ? `„${row.lemma}“` : "das allererste",
          }
        : { on: day(row.at), title: `${mark} Wörter`, detail: "eingeführt und im Deck" },
    );
  }

  // Firsts, each from the attempt log.
  for (const f of FIRSTS) {
    const at = get<{ at: string }>(
      "SELECT MIN(created_at) AS at FROM attempt WHERE user_id = ? AND kind = ?",
      userId,
      f.kind,
    )?.at;
    if (at) out.push({ on: day(at), title: f.title, detail: f.detail });
  }

  // Levels, but only ones that are genuinely finished end to end.
  const perLevel = all<{ level: string; done: number; at: string }>(
    `SELECT u.level AS level, COUNT(*) AS done, MAX(p.completed_at) AS at
       FROM unit_progress p JOIN unit u ON u.id = p.unit_id
      WHERE p.user_id = ? AND p.status = 'complete'
      GROUP BY u.level`,
    userId,
  );
  const sizes = new Map(
    all<{ level: string; n: number }>(
      "SELECT level, COUNT(*) AS n FROM unit GROUP BY level",
    ).map((r) => [r.level, r.n] as const),
  );
  for (const l of perLevel) {
    if (l.at && l.done === sizes.get(l.level)) {
      out.push({ on: day(l.at), title: `${l.level} abgeschlossen`, detail: `alle ${l.done} Units` });
    }
  }

  // First exam, with the score it actually got.
  const exam = get<{ at: string; correct: number; total: number; level: string }>(
    `SELECT created_at AS at, correct, total, level FROM exam_run
      WHERE user_id = ? ORDER BY created_at LIMIT 1`,
    userId,
  );
  if (exam) {
    out.push({
      on: day(exam.at),
      title: "Erster Übungstest",
      detail: `${exam.level} · ${exam.correct} von ${exam.total}`,
    });
  }

  // The longest run of consecutive days, dated to the day it peaked.
  const streak = get<{ n: number; date: string }>(
    `SELECT streak_day AS n, date FROM session_log
      WHERE user_id = ? AND streak_day >= 7 ORDER BY streak_day DESC, date DESC LIMIT 1`,
    userId,
  );
  if (streak?.n) {
    out.push({
      on: streak.date,
      title: `${streak.n} Tage am Stück`,
      detail: "längste Serie bisher",
    });
  }

  return out.sort((a, b) => a.on.localeCompare(b.on));
}

/**
 * Days between the first session and a date — "Tag 42" rather than a bare
 * calendar date, which is what people actually remember things by.
 */
export function dayIndex(firstDate: string, on: string): number {
  const a = Date.parse(`${firstDate}T00:00:00Z`);
  const b = Date.parse(`${on}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000)) + 1;
}
