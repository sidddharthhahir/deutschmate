import { all, get, run } from "./db";
import type {
  Exam,
  ExamQuestion,
  SectionKey,
  SectionScore,
} from "./exam-score";
import { EXAM_MINUTES as MINUTES } from "@/lib/config";

export type { Exam, SectionScore };

/** Übungstest — the exam-shaped run. */

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

// ---------------------------------------------------------------- helpers

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Place the right answer among distractors and report where it landed. */
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
  const rows = all<{
    id: string;
    title: string;
    body: string;
    questions_json: string;
  }>(
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

/** Listening: hear a sentence, pick what was said. */
function hoeren(levels: string[], want: number): ExamQuestion[] {
  const ph = placeholders(levels.length);
  const rows = all<{
    id: string;
    example_de: string;
    example_en: string;
  }>(
    `SELECT id, example_de, example_en FROM word
      WHERE level IN (${ph}) AND example_de IS NOT NULL AND length(example_de) > 12`,
    ...levels,
  );
  if (rows.length < 4) return [];

  const pool = shuffle(rows);
  return pool.slice(0, want).map((r, i) => {
    const others = pool.filter((x) => x.example_de !== r.example_de);
    /*
     * Rotate a window through the others and wrap, rather than the old
     * `slice(i * 3 + want, …)`. That ran off the end of a small pool and
     * returned fewer than three distractors, which silently produced a
     * question with two options instead of four.
     */
    const distractors = Array.from(
      { length: Math.min(3, others.length) },
      (_, k) => others[(i * 3 + k) % others.length].example_de,
    );
    const { options, answer } = withOptions(r.example_de, distractors);
    return {
      id: `hoeren-${r.id}`,
      section: "hoeren",
      context: r.example_de,
      /*
       * Deliberately null, not word.audio_url — see listeningItems() in
       * session.ts. The recording is of the lemma, the answer is the example
       * sentence, so playing the file asked you to pick a sentence off the
       * sound of one word. It also means every question now has audio: the
       * query never filtered on audio_url, so 30% of A1 Hören questions were
       * silent. Synthesis reads the sentence, and reads all of them.
       */
      audio: null,
      prompt: "Was hören Sie?",
      options,
      answer,
    };
  });
}

/** Vocabulary: German word, four English glosses. Distractors share the POS. */
function wortschatz(levels: string[], want: number): ExamQuestion[] {
  const ph = placeholders(levels.length);
  const rows = all<{
    id: string;
    lemma: string;
    article: string | null;
    pos: string;
    en: string;
  }>(
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
      const distractors =
        same.length >= 3
          ? same
          : shuffle(rows.map((x) => x.en).filter((e) => e !== r.en));
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
