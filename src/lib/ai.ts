import Anthropic from "@anthropic-ai/sdk";
import { budgetLeft } from "./cost";

/**
 * The AI layer.
 *
 * Three rules from the spec, all load-bearing:
 *
 *  §8  Every generated sentence uses ONLY words the learner already knows.
 *      This is what separates a teacher from a chatbot. A beginner talking to
 *      an unconstrained model gets fluent German they can't read, gives up,
 *      and blames themselves.
 *
 *  §12 Spend once with the best model, serve from SQLite forever. Only
 *      genuinely per-user work reaches this file at runtime: conversation and
 *      writing correction. Everything else is pre-generated or cached.
 *
 *  §17 Every call has an offline fallback. Nothing here is allowed to be the
 *      reason a session can't be finished.
 */

export const MODELS = {
  /** Conversation + writing correction — quality matters, cost is controlled by caching. */
  quality: "claude-sonnet-5",
  /** Mechanical explanations on a cache miss. */
  cheap: "claude-haiku-4-5",
} as const;

/**
 * Per-task model settings, in one place so the cost of the whole app can be
 * read off a single table.
 *
 * The two knobs that actually move the bill:
 *
 *   thinking — Sonnet 5 thinks by DEFAULT when the field is omitted. That is a
 *   change from earlier models and it is the wrong default here: a two-sentence
 *   café reply does not need a reasoning pass, and the thinking tokens are
 *   billed at output rates. Every call below states its choice rather than
 *   inheriting one.
 *
 *   effort — how hard the model works before answering. `low` is right for
 *   conversation (short, formulaic, heavily constrained by the vocabulary
 *   whitelist) and wrong for writing correction, where missing a real error is
 *   worse than the extra tokens.
 *
 * Haiku 4.5 supports neither parameter — `effort` is rejected outright, and its
 * thinking is the older budget_tokens form. Omitting both is "no thinking",
 * which is what these calls want anyway.
 */
const TASK = {
  chat: { model: MODELS.quality, maxTokens: 300, effort: "low" },
  review: { model: MODELS.quality, maxTokens: 900, effort: "low" },
  writing: { model: MODELS.quality, maxTokens: 1500, effort: "medium" },
  explain: { model: MODELS.cheap, maxTokens: 500 },
  mistake: { model: MODELS.cheap, maxTokens: 250 },
} as const;

/** Sonnet-5 calls: state the thinking choice, never inherit the default. */
const NO_THINKING = { type: "disabled" } as const;

/**
 * Every call returns its usage alongside its result.
 *
 * These counts arrive on every response and used to be discarded everywhere
 * except the chat route, which meant the one hard constraint on this project —
 * a $10 monthly ceiling — could not be checked. Callers pass them to
 * recordUsage(); see lib/cost.ts.
 */
export type Metered<T> = { result: T; model: string; usage: Anthropic.Usage };

let _client: Anthropic | null = null;

/**
 * Is there a credential to call with?
 *
 * The SDK also authenticates from ANTHROPIC_AUTH_TOKEN, so checking only the
 * API key reported "offline" on a machine where a call would have worked.
 */
export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Thrown when the month's budget is used up. Routes turn this into `offline`. */
export class BudgetExceeded extends Error {
  constructor(readonly spent: number, readonly ceiling: number) {
    super(`monthly budget reached — $${spent.toFixed(2)} of $${ceiling.toFixed(2)}`);
    this.name = "BudgetExceeded";
  }
}

/**
 * Refuse to spend past the ceiling.
 *
 * The app is built around a hard monthly limit, and a limit nothing enforces is
 * a wish. Every paid call passes through here first. The learner is not blocked
 * by this — the session falls back to its offline path exactly as it does with
 * no API key at all, which is the same code path and is already tested.
 */
function guard(userId: string) {
  const left = budgetLeft(userId);
  if (left.remaining <= 0) throw new BudgetExceeded(left.spent, left.ceiling);
}

function client() {
  if (!aiAvailable()) throw new Error("ANTHROPIC_API_KEY is not set");
  _client ??= new Anthropic();
  return _client;
}

function text(msg: Anthropic.Message) {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/**
 * Parse a structured response, or return a fallback.
 *
 * Structured outputs make malformed JSON unlikely, not impossible — a response
 * cut short by max_tokens is valid text and invalid JSON. An unguarded parse
 * here threw past the caller's recordUsage(), so a call that had already been
 * billed vanished from the ledger and the learner saw a generic failure.
 */
function parseOr<T>(msg: Anthropic.Message, fallback: T): T {
  try {
    return JSON.parse(text(msg)) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------- conversation

export type Turn = { role: "user" | "assistant"; content: string };

/**
 * Build the tutor system prompt.
 *
 * The vocabulary list is large but IDENTICAL across every request in a session,
 * so it sits at the front of the prompt behind a cache breakpoint. Cache reads
 * cost ~10% of normal input — at B1 the whitelist is a few thousand tokens and
 * without this it would be the app's single biggest expense.
 *
 * The TTL is one hour, not the five-minute default, because that is the shape
 * of the session this app is built for. Five minutes means a fresh write every
 * few turns while the learner is typing; an hour means one write per sitting.
 * The write costs 2x instead of 1.25x, so it pays for itself after three turns
 * and every turn after that is a 0.1x read.
 *
 * Two things keep the prefix stable, and both matter more than the marker:
 * the word list is ordered by frequency rank (never by a set or a map), and the
 * scenario — which changes per unit — sits AFTER the breakpoint.
 */
function tutorSystem(level: string, vocabulary: string[], scenario: Scenario) {
  return [
    {
      type: "text" as const,
      text: `You are a patient German tutor role-playing with a ${level} learner.

ABSOLUTE RULE — VOCABULARY
You may ONLY use German words from the list below, plus proper nouns (names,
cities) and numbers. Never use a German word outside this list. If you need a
concept you cannot express with these words, choose a simpler concept.

If the list is very short, the learner is on their first days. Speak in single
words and two-word phrases rather than reaching for a word that is not there.
Repetition is fine — hearing "Wie geht's?" a third time is a lesson, not a gap.

ALLOWED WORDS (${vocabulary.length}):
${vocabulary.join(", ")}

HOW TO SPEAK
- One or two short sentences per turn. Never a paragraph.
- Stay in role. Do not narrate, do not break character, do not add English
  translations unless the learner is clearly stuck twice in a row.
- Ask a question most turns so the learner has something to answer.
- Do NOT correct grammar mid-conversation. Corrections come afterwards, from a
  separate pass. Interrupting a beginner mid-sentence is how people stop talking.
- If the learner writes English, reply in German anyway, more simply.`,
      cache_control: { type: "ephemeral" as const, ttl: "1h" as const },
    },
    {
      type: "text" as const,
      text: `SCENE
You are: ${scenario.role}
The learner's goal: ${scenario.goal}
Open with, or close to: "${scenario.opener}"`,
    },
  ];
}

export type Scenario = { role: string; goal: string; opener: string };

export async function converse(opts: {
  userId: string;
  level: string;
  vocabulary: string[];
  scenario: Scenario;
  history: Turn[];
}) {
  guard(opts.userId);
  const msg = await client().messages.create({
    model: TASK.chat.model,
    max_tokens: TASK.chat.maxTokens,
    thinking: NO_THINKING,
    output_config: { effort: TASK.chat.effort },
    system: tutorSystem(opts.level, opts.vocabulary, opts.scenario),
    messages: opts.history.length
      ? opts.history
      : [{ role: "user", content: "(the learner has just arrived — greet them)" }],
  });
  return { reply: text(msg), model: TASK.chat.model, usage: msg.usage };
}

/**
 * The correction schema, shared by both correction passes.
 *
 * It was written out twice, identically, in two functions that must agree —
 * `tag` in particular has to match the closed set the error tagger knows about,
 * and a schema that drifted in one place would have produced tags no page could
 * render.
 */
const CORRECTION_ITEM = {
  type: "object",
  properties: {
    original: { type: "string" },
    corrected: { type: "string" },
    why: { type: "string" },
    tag: { type: "string" },
  },
  required: ["original", "corrected", "why", "tag"],
  additionalProperties: false,
} as const;

const CORRECTIONS_ARRAY = { type: "array", items: CORRECTION_ITEM } as const;

/** Post-conversation correction pass — never shown mid-flow. */
export async function reviewConversation(opts: {
  userId: string;
  level: string;
  history: Turn[];
}): Promise<Metered<Correction[]> | null> {
  const learner = opts.history.filter((t) => t.role === "user");
  /* Nothing to review. Returning null rather than an empty Metered keeps a
     zero-token row out of the ledger — those rows inflated the call count on
     /kosten without ever representing a call. */
  if (!learner.length) return null;

  guard(opts.userId);
  const msg = await client().messages.create({
    model: TASK.review.model,
    max_tokens: TASK.review.maxTokens,
    thinking: NO_THINKING,
    output_config: {
      effort: TASK.review.effort,
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: { corrections: CORRECTIONS_ARRAY },
          required: ["corrections"],
          additionalProperties: false,
        },
      },
    },
    system: `You review a ${opts.level} German learner's sentences after a conversation.
For each sentence with a real mistake, return an object. Ignore missing capitals
on the first word, missing final punctuation, and stylistic preferences —
only report things that are actually wrong.
Explain in plain English, one sentence, no jargon unless you define it.`,
    messages: [
      {
        role: "user",
        content: `Review these:\n${learner.map((t, i) => `${i + 1}. ${t.content}`).join("\n")}`,
      },
    ],
  });

  return {
    result: parseOr<{ corrections: Correction[] }>(msg, { corrections: [] }).corrections,
    model: TASK.review.model,
    usage: msg.usage,
  };
}

export type Correction = {
  original: string;
  corrected: string;
  why: string;
  tag: string;
};

// ---------------------------------------------------------------- writing

export type WritingFeedback = {
  corrections: Correction[];
  natural: string;
  encouragement: string;
};

export async function correctWriting(opts: {
  userId: string;
  level: string;
  prompt: string;
  body: string;
}): Promise<Metered<WritingFeedback>> {
  guard(opts.userId);
  const msg = await client().messages.create({
    model: TASK.writing.model,
    max_tokens: TASK.writing.maxTokens,
    /* The one place worth thinking tokens: this is a handful of calls a week,
       and a missed error is a mistake the learner keeps making. */
    thinking: { type: "adaptive" },
    output_config: {
      effort: TASK.writing.effort,
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            corrections: CORRECTIONS_ARRAY,
            natural: { type: "string" },
            encouragement: { type: "string" },
          },
          required: ["corrections", "natural", "encouragement"],
          additionalProperties: false,
        },
      },
    },
    system: `You correct short German texts by a ${opts.level} learner.

Be encouraging but accurate. Rules:
- Only flag real errors. Do not rewrite correct German into your preferred style.
- "natural" is a rewrite of their text as a native would put it, staying at
  their level — do not introduce vocabulary or structures above ${opts.level}.
- Explain each correction in one plain-English sentence.
- "encouragement" names one specific thing they got right — a case ending, a
  word order, a word choice. Not "good job": something they can repeat.
- tag must be one of: article-gender, article-akkusativ, verb-ending,
  verb-position-2, verb-final, plural, negation, pronoun, capitalisation,
  spelling, word-order, vocabulary.`,
    messages: [
      { role: "user", content: `Task: ${opts.prompt}\n\nTheir text:\n${opts.body}` },
    ],
  });

  return {
    result: parseOr<WritingFeedback>(msg, {
      corrections: [],
      natural: "",
      encouragement: "",
    }),
    model: TASK.writing.model,
    usage: msg.usage,
  };
}

// ---------------------------------------------------------------- explanations

/**
 * Break a German sentence down for a learner at `level`.
 *
 * Cache-miss path only — the caller stores the result (spec §12). German
 * learners look up the same sentences, so this table converges and the live
 * cost decays toward zero, which is what keeps the whole thing inside $10.
 *
 * No prompt caching here on purpose: the system prompt is ~150 tokens and
 * Haiku's minimum cacheable prefix is 4096. A cache_control marker on a prefix
 * that short does nothing at all — it does not error, it just never caches, and
 * it would read as if the saving were already handled.
 */
export async function explainSentence(userId: string, sentence: string, level: string) {
  guard(userId);
  const msg = await client().messages.create({
    model: TASK.explain.model,
    max_tokens: TASK.explain.maxTokens,
    system: `You explain one German sentence to a ${level} learner, in English.

Structure, exactly:
- One line: what the sentence means.
- Then a short "-" list, one item per thing worth noticing: case endings, verb
  position, separable prefixes, word order, a tricky article.
- At most five items. Skip anything obvious at ${level}.

Rules:
- Explain the RULE, not just this instance: "dative after mit — always" beats
  "mit takes dem here".
- No preamble, no headings, no "Great question!", no restating the task.
- Plain English. If you use a grammar term, define it in three words.`,
    messages: [{ role: "user", content: sentence }],
  });
  return { result: text(msg), model: TASK.explain.model, usage: msg.usage };
}

/**
 * Why an answer was wrong — the "Warum?" behind every correction.
 *
 * Cache-miss path only; the result is stored by the caller (spec §12) against a
 * signature of (expected, answer), so the same mistake is explained once and
 * then served from SQLite for every learner who makes it afterwards.
 */
export async function explainMistake(
  userId: string,
  expected: string,
  got: string,
  tags: string[],
) {
  guard(userId);
  const msg = await client().messages.create({
    model: TASK.mistake.model,
    max_tokens: TASK.mistake.maxTokens,
    system: `Explain one German mistake to a beginner in 2-3 short sentences of
plain English.

Answer the question "why?", in this order:
1. The rule, stated generally — the thing that is also true next time.
2. Why it applies here specifically.

"Akkusativ after 'sehen' — always. 'Mann' is masculine, so 'der' becomes 'den'."
beats "the correct answer is den". No preamble, no "Great question!", no
markdown headings, no restating what they wrote.`,
    messages: [
      {
        role: "user",
        content: `Correct: ${expected}\nThey wrote: ${got}\nLikely issue: ${tags.join(", ") || "unknown"}`,
      },
    ],
  });
  return { result: text(msg), model: TASK.mistake.model, usage: msg.usage };
}
