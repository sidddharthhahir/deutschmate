/**
 * The exam's pure half: shapes and arithmetic, no database.
 *
 * Split out because the runner is a client component. Importing the scorer
 * from exam.ts would drag node:sqlite into the browser bundle — and the fix
 * for that must not be "let the client score it a second, separate way",
 * which is how two implementations of one number get started.
 */

export type SectionKey = "lesen" | "hoeren" | "wortschatz" | "grammatik";

export type ExamQuestion = {
  id: string;
  section: SectionKey;
  /** Passage to read, or sentence to hear. Absent for bare questions. */
  context?: string;
  /** For listening: a real recording when one exists, else the browser speaks it. */
  audio?: string | null;
  prompt: string;
  options: string[];
  answer: number;
};

export type ExamSection = {
  key: SectionKey;
  title: string;
  instruction: string;
  questions: ExamQuestion[];
};

export type Exam = {
  level: string;
  minutes: number;
  sections: ExamSection[];
  total: number;
};

export type SectionScore = {
  key: SectionKey;
  title: string;
  correct: number;
  total: number;
};

/**
 * Score a paper against a list of picks — one index per question in flattened
 * order, `null` for skipped.
 *
 * Sections are walked with a running offset rather than by looking each
 * question up in the flattened array: identical questions can legitimately
 * appear twice (two sections can draw the same drill), and indexOf would then
 * score the second one against the first one's position.
 */
export function scoreExam(exam: Exam, picks: (number | null)[]) {
  const questions = exam.sections.flatMap((s) => s.questions);
  let offset = 0;
  const sections: SectionScore[] = exam.sections.map((s) => {
    const from = offset;
    offset += s.questions.length;
    return {
      key: s.key,
      title: s.title,
      correct: s.questions.filter((q, k) => picks[from + k] === q.answer).length,
      total: s.questions.length,
    };
  });
  return {
    questions,
    sections,
    correct: sections.reduce((n, s) => n + s.correct, 0),
    total: questions.length,
  };
}
