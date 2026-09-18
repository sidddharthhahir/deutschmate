/** Shapes shared across the session module — the plan the builder assembles and the content rows it draws from. */

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
  /** What comes after this unit, by name. */
  next: { ord: number; title: string } | null;
  /**
   * Whole days skipped since the last session. Reported so the screen can say
   * why today is longer than yesterday: a missed day showed up only as a bigger
   * number on the button, with nothing anywhere admitting a day had been lost.
   */
  missed: number;
  /** No hearts left today — new-vocab/new-grammar were skipped, reviews were not. */
  heartsEmpty: boolean;
};

/** "short" runs only the parts that decay: reviews, Fix, Lücken, grammar. */
export type SessionMode = "full" | "short";
