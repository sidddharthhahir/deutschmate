import Anthropic from "@anthropic-ai/sdk";
import { budgetLeft } from "./cost";
import { modelFor } from "./models.ts";
import { keyFor } from "./apikey.ts";
import { coachingBrief, type Memory } from "./coaching";

export type { Memory };

/**
 * The AI layer. Three rules from the spec, all load-bearing: §8 Every generated sentence uses ONLY
 * words the learner already knows.
 */

/** Which model does which kind of work. */
export const MODELS = {
  get quality() {
    return modelFor("quality");
  },
  get cheap() {
    return modelFor("cheap");
  },
};

/**
 * Per-task model settings, in one place so the cost of the whole app can be read off a single
 * table.
 */
const TASK = {
  chat: {
    get model() {
      return MODELS.quality;
    },
    maxTokens: 300,
    effort: "low",
  },
  review: {
    get model() {
      return MODELS.quality;
    },
    maxTokens: 900,
    effort: "low",
  },
  writing: {
    get model() {
      return MODELS.quality;
    },
    maxTokens: 1500,
    effort: "medium",
  },
  explain: {
    get model() {
      return MODELS.cheap;
    },
    maxTokens: 500,
  },
  mistake: {
    get model() {
      return MODELS.cheap;
    },
    maxTokens: 250,
  },
} as const;

/** The TTL the tutor prompt is cached with, named once. */
export const TUTOR_CACHE_TTL = "1h" as const;

/** Sonnet-5 calls: state the thinking choice, never inherit the default. */
const NO_THINKING = { type: "disabled" } as const;

/** Every call returns its usage alongside its result. */
export type Metered<T> = { result: T; model: string; usage: Anthropic.Usage };

/** Is there a credential to call with, FOR THIS LEARNER? */
export function aiAvailable(userId: string) {
  return keyFor(userId) !== null;
}

/** Thrown when the month's budget is used up. Routes turn this into `offline`. */
export class BudgetExceeded extends Error {
  constructor(
    readonly spent: number,
    readonly ceiling: number,
  ) {
    super(
      `monthly budget reached — $${spent.toFixed(2)} of $${ceiling.toFixed(2)}`,
    );
    this.name = "BudgetExceeded";
  }
}

/** Refuse to spend past the ceiling. */
function guard(userId: string) {
  const left = budgetLeft(userId);
  if (left.remaining <= 0) throw new BudgetExceeded(left.spent, left.ceiling);
}

/** A client holding one learner's key. */
function client(userId: string) {
  const apiKey = keyFor(userId);
  if (!apiKey) throw new Error("no API key for this learner");
  return new Anthropic({ apiKey });
}

function text(msg: Anthropic.Message) {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Parse a structured response, or return a fallback. */
function parseOr<T>(msg: Anthropic.Message, fallback: T): T {
  try {
    return JSON.parse(text(msg)) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------- conversation

export type Turn = { role: "user" | "assistant"; content: string };

/** Build the tutor system prompt. */
/**
 * The floor under the whitelist. knownVocabulary() returns the words this learner has actually
 * met, which on day one is none — and the rule below is absolute, so the prompt read "ALLOWED
 * WORDS (0):" followed by nothing: an instruction forbidding every German word there is. /alltag
 * is the likeliest place to hit it, and it is aimed squarely at people who do not have a deck yet.
 */
const STARTER_WORDS = [
  "hallo",
  "guten",
  "Tag",
  "Morgen",
  "Abend",
  "tschüss",
  "auf Wiedersehen",
  "ja",
  "nein",
  "bitte",
  "danke",
  "gut",
  "sehr",
  "und",
  "oder",
  "aber",
  "ich",
  "du",
  "Sie",
  "wir",
  "er",
  "sie",
  "es",
  "bin",
  "bist",
  "ist",
  "sind",
  "habe",
  "hast",
  "hat",
  "haben",
  "wie",
  "was",
  "wer",
  "wo",
  "wann",
  "warum",
  "heiße",
  "heißt",
  "komme",
  "kommst",
  "kommt",
  "aus",
  "wohne",
  "wohnst",
  "möchte",
  "möchten",
  "kann",
  "nicht",
  "kein",
  "ein",
  "eine",
  "der",
  "die",
  "das",
  "Entschuldigung",
  "langsam",
  "noch einmal",
  "verstehe",
];

function tutorSystem(level: string, vocabulary: string[], scenario: Scenario) {
  const allowed = vocabulary.length ? vocabulary : STARTER_WORDS;
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

ALLOWED WORDS (${allowed.length}):
${allowed.join(", ")}

HOW TO SPEAK
- One or two short sentences per turn. Never a paragraph.
- Stay in role. Do not narrate, do not break character, do not add English
  translations unless the learner is clearly stuck twice in a row.
- Ask a question most turns so the learner has something to answer.
- Do NOT correct grammar mid-conversation. Corrections come afterwards, from a
  separate pass. Interrupting a beginner mid-sentence is how people stop talking.
- If the learner writes English, reply in German anyway, more simply.`,
      cache_control: { type: "ephemeral" as const, ttl: TUTOR_CACHE_TTL },
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
  memory?: Memory;
}) {
  guard(opts.userId);

  const system = tutorSystem(opts.level, opts.vocabulary, opts.scenario);
  const brief = opts.memory ? coachingBrief(opts.memory) : null;
  if (brief) system.push({ type: "text" as const, text: brief });

  const msg = await client(opts.userId).messages.create({
    model: TASK.chat.model,
    max_tokens: TASK.chat.maxTokens,
    thinking: NO_THINKING,
    output_config: { effort: TASK.chat.effort },
    system,
    messages: opts.history.length
      ? opts.history
      : [
          {
            role: "user",
            content: "(the learner has just arrived — greet them)",
          },
        ],
  });
  return { reply: text(msg), model: TASK.chat.model, usage: msg.usage };
}

/** The correction schema, shared by both correction passes. */
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
  const msg = await client(opts.userId).messages.create({
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
    result: parseOr<{ corrections: Correction[] }>(msg, { corrections: [] })
      .corrections,
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
  const msg = await client(opts.userId).messages.create({
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
      {
        role: "user",
        content: `Task: ${opts.prompt}\n\nTheir text:\n${opts.body}`,
      },
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
 * Break a German sentence down for a learner at `level`. Cache-miss path only — the caller stores
 * the result (spec §12).
 */
export async function explainSentence(
  userId: string,
  sentence: string,
  level: string,
) {
  guard(userId);
  const msg = await client(userId).messages.create({
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

/** A memory hook for a word that will not stick. */
export async function mnemonicFor(
  userId: string,
  word: { lemma: string; article: string | null; en: string; pos: string },
) {
  guard(userId);
  const msg = await client(userId).messages.create({
    model: TASK.mistake.model,
    max_tokens: 120,
    system: `You write one memory hook for a German word a learner keeps forgetting.

One or two sentences, English, concrete and visual. Rules:
- Hang it on how the German SOUNDS to an English ear, or on a real connection
  to an English word. Never invent a false etymology — say "sounds like", not
  "comes from".
- If the word has an article, the hook must encode the gender too: that is
  usually the half they are losing.
- No preamble, no "Here's a mnemonic", no quotation marks around the whole
  thing. Just the hook.
- Silly is fine. Silly is why it works. Nothing crude.`,
    messages: [
      {
        role: "user",
        content: `${word.article ? `${word.article} ` : ""}${word.lemma} (${word.pos}) = ${word.en}`,
      },
    ],
  });
  return { result: text(msg), model: TASK.mistake.model, usage: msg.usage };
}

/** Why an answer was wrong — the "Warum?" behind every correction. */
export async function explainMistake(
  userId: string,
  expected: string,
  got: string,
  tags: string[],
) {
  guard(userId);
  const msg = await client(userId).messages.create({
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
