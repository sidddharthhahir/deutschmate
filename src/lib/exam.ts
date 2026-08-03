import { all, get, run } from "./db";
import type { Exam, ExamQuestion, ExamSection, SectionKey, SectionScore } from "./exam-score";

export type { Exam, ExamQuestion, ExamSection, SectionKey, SectionScore };
export { scoreExam } from "./exam-score";

/**
 * Übungstest — the exam-shaped run.
 *
 * WHAT THIS IS, precisely, because the distinction matters (principle 4):
 * this is a timed test built from THIS APP'S OWN content, in the shape of a
 * Goethe exam. It is not the official Modellsatz, it is not scored against the
 * official key, and a percentage here is not a prediction that you would pass.
 * The Goethe-Institut publishes real Modellsätze as free PDFs; those are the
 * ones that answer "am I actually B1 yet", and the app links to them rather
 * than pretending to reproduce them.
 *
 * What it IS good for, and what nothing else in the app does: sustained
 * performance. Every other block is short, forgiving and immediate. Here you
 * answer thirty questions across four skills with a clock running and no
 * feedback until the end — which is the only condition under which you find
 * out what you actually retain under pressure.
 */

export const LEVELS = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2"] as const;
export type Level = (typeof LEVELS)[number];

/** Every level at or below `level` — the exam's content scope. */
export function levelsUpTo(level: string): string[] {
  const i = LEVELS.indexOf(level as Level);
  return i === -1 ? [...LEVELS] : LEVELS.slice(0, i + 1);
}

const PLAN: Record<SectionKey, number> = {
  lesen: 5,
  hoeren: 5,
  wortschatz: 10,
  grammatik: 10,
};

const MINUTES = 30;

// ---------------------------------------------------------------- helpers

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Place the right answer among distractors and report where it landed.
 * Options are always shuffled — a fixed position is a tell, and a learner
 * will find it long before they find the grammar.
 */
function withOptions(correct: string, distractors: string[]) {
  const opts = shuffle([correct, ...distractors.slice(0, 3)]);
  return { options: opts, answer: opts.indexOf(correct) };
}

function placeholders(n: number) {
  return Array.from({ length: n }, () => "?").join(",");
}

// ---------------------------------------------------------------- sections

/** Reading: a real passage from the course, with its own comprehension questions. */
function lesen(levels: string[], want: number): ExamQuestion[] {
  const ph = placeholders(levels.length);
  const rows = all<{ id: string; title: string; body: string; questions_json: string }>(
    `SELECT id, title, body, questions_json FROM reading
      WHERE level IN (${ph}) AND questions_json != '[]'`,
    ...levels,
  );

  const out: ExamQuestion[] = [];
  for (const r of shuffle(rows)) {
    let qs: { q: string; options: string[]; a: number }[];
    try {
      qs = JSON.parse(r.questions_json);
    } catch {
      continue;
    }
    // Two questions per passage at most: reading four passages beats reading
    // one and answering five times, and it spreads the vocabulary wider.
    for (const q of shuffle(qs).slice(0, 2)) {
      if (out.length >= want) break;
      out.push({
        id: `lesen-${r.id}-${out.length}`,
        section: "lesen",
        context: r.body,
        prompt: q.q,
        options: q.options,
        answer: q.a,
      });
    }
    if (out.length >= want) break;
  }
  return out;
}

/**
 * Listening: hear a sentence, pick what was said.
 *
 * Discrimination, not comprehension — the distractors are other real sentences
 * from the same level, so the task is genuinely about hearing rather than
 * guessing from context.
 */
function hoeren(levels: string[], want: number): ExamQuestion[] {
  const ph = placeholders(levels.length);
  const rows = all<{ id: string; example_de: string; example_en: string; audio_url: string | null }>(
    `SELECT id, example_de, example_en, audio_url FROM word
      WHERE level IN (${ph}) AND example_de IS NOT NULL AND length(example_de) > 12`,
    ...levels,
  );
  if (rows.length < 4) return [];

  const pool = shuffle(rows);
  return pool.slice(0, want).map((r, i) => {
    const distractors = pool
      .filter((x) => x.example_de !== r.example_de)
      .slice(i * 3 + want, i * 3 + want + 3)
      .map((x) => x.example_de);
    const { options, answer } = withOptions(r.example_de, distractors);
    return {
      id: `hoeren-${r.id}`,
      section: "hoeren",
      context: r.example_de,
      audio: r.audio_url,
      prompt: "Was hören Sie?",
      options,
      answer,
    };
  });
}

/** Vocabulary: German word, four English glosses. Distractors share the POS. */
function wortschatz(levels: string[], want: number): ExamQuestion[] {
  const ph = placeholders(levels.length);
  const rows = all<{ id: string; lemma: string; article: string | null; pos: string; en: string }>(
    `SELECT id, lemma, article, pos, en FROM word WHERE level IN (${ph})`,
    ...levels,
  );
  if (rows.length < 4) return [];

  const byPos = new Map<string, string[]>();
  for (const r of rows) {
    const list = byPos.get(r.pos) ?? [];
    list.push(r.en);
    byPos.set(r.pos, list);
  }

  return shuffle(rows)
    .slice(0, want)
    .map((r) => {
      const same = shuffle((byPos.get(r.pos) ?? []).filter((e) => e !== r.en));
      const distractors = same.length >= 3 ? same : shuffle(rows.map((x) => x.en).filter((e) => e !== r.en));
      const { options, answer } = withOptions(r.en, distractors);
      return {
        id: `wortschatz-${r.id}`,
        section: "wortschatz",
        prompt: r.article ? `${r.article} ${r.lemma}` : r.lemma,
        options,
        answer,
      };
    });
}

/** Grammar: the course's own drills, which already have an explanation attached. */
function grammatik(levels: string[], want: number): ExamQuestion[] {
  const ph = placeholders(levels.length);
  const rows = all<{ id: string; drills_json: string }>(
    `SELECT id, drills_json FROM grammar WHERE level IN (${ph}) AND drills_json != '[]'`,
    ...levels,
  );

  const pool: ExamQuestion[] = [];
  for (const r of rows) {
    let drills: { q: string; options: string[]; a: number }[];
    try {
      drills = JSON.parse(r.drills_json);
    } catch {
      continue;
    }
    drills.forEach((d, i) => {
      pool.push({
        id: `grammatik-${r.id}-${i}`,
        section: "grammatik",
        prompt: d.q,
        options: d.options,
        answer: d.a,
      });
    });
  }
  return shuffle(pool).slice(0, want);
}

// ---------------------------------------------------------------- assembly

const TITLES: Record<SectionKey, { title: string; instruction: string }> = {
  lesen: {
    title: "Lesen",
    instruction: "Lesen Sie den Text und beantworten Sie die Frage.",
  },
  hoeren: {
    title: "Hören",
    instruction: "Hören Sie den Satz. Was hören Sie? Sie können zweimal hören.",
  },
  wortschatz: {
    title: "Wortschatz",
    instruction: "Was bedeutet das Wort?",
  },
  grammatik: {
    title: "Grammatik",
    instruction: "Wählen Sie die richtige Form.",
  },
};

export function buildExam(level: string): Exam {
  const levels = levelsUpTo(level);
  const built: Record<SectionKey, ExamQuestion[]> = {
    lesen: lesen(levels, PLAN.lesen),
    hoeren: hoeren(levels, PLAN.hoeren),
    wortschatz: wortschatz(levels, PLAN.wortschatz),
    grammatik: grammatik(levels, PLAN.grammatik),
  };

  // A section with no content is left out rather than padded. An exam that
  // silently shows three Hören questions instead of five is lying about its
  // own shape; an exam with no Hören section is just honest about the gap.
  const sections = (Object.keys(built) as SectionKey[])
    .filter((k) => built[k].length > 0)
    .map((k) => ({ key: k, ...TITLES[k], questions: built[k] }));

  return {
    level,
    minutes: MINUTES,
    sections,
    total: sections.reduce((n, s) => n + s.questions.length, 0),
  };
}

// ---------------------------------------------------------------- results

export function saveExamRun(opts: {
  userId: string;
  level: string;
  sections: SectionScore[];
  minutes: number;
}) {
  const correct = opts.sections.reduce((n, s) => n + s.correct, 0);
  const total = opts.sections.reduce((n, s) => n + s.total, 0);
  run(
    `INSERT INTO exam_run (user_id, level, sections_json, correct, total, minutes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    opts.userId,
    opts.level,
    JSON.stringify(opts.sections),
    correct,
    total,
    opts.minutes,
  );
  return { correct, total };
}

export type ExamRun = {
  id: number;
  level: string;
  sections_json: string;
  correct: number;
  total: number;
  minutes: number;
  created_at: string;
};

export function examHistory(userId: string, limit = 10): ExamRun[] {
  return all<ExamRun>(
    `SELECT id, level, sections_json, correct, total, minutes, created_at
       FROM exam_run WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    userId,
    limit,
  );
}

export function lastExam(userId: string): ExamRun | undefined {
  return get<ExamRun>(
    `SELECT id, level, sections_json, correct, total, minutes, created_at
       FROM exam_run WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    userId,
  );
}
