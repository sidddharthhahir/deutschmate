import Anthropic from "@anthropic-ai/sdk";

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

const MODELS = {
  /** Conversation + writing correction — quality matters, cost is controlled by caching. */
  quality: "claude-sonnet-5",
  /** Mechanical explanations on a cache miss. */
  cheap: "claude-haiku-4-5",
} as const;

let _client: Anthropic | null = null;

export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
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

// ---------------------------------------------------------------- conversation

export type Turn = { role: "user" | "assistant"; content: string };

/**
 * Build the tutor system prompt.
 *
 * The vocabulary list is large but IDENTICAL across every request in a session,
 * so it sits at the front of the prompt behind a cache breakpoint. Cache reads
 * cost ~10% of normal input — without this, the constraint would be the app's
 * single biggest expense. With it, it's nearly free.
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
      cache_control: { type: "ephemeral" as const },
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
  level: string;
  vocabulary: string[];
  scenario: Scenario;
  history: Turn[];
}) {
  const msg = await client().messages.create({
    model: MODELS.quality,
    max_tokens: 300,
    system: tutorSystem(opts.level, opts.vocabulary, opts.scenario),
    messages: opts.history.length
      ? opts.history
      : [{ role: "user", content: "(the learner has just arrived — greet them)" }],
  });
  return { reply: text(msg), usage: msg.usage };
}

/** Post-conversation correction pass — never shown mid-flow. */
export async function reviewConversation(opts: {
  level: string;
  history: Turn[];
}) {
  const learner = opts.history.filter((t) => t.role === "user");
  if (!learner.length) return [];

  const msg = await client().messages.create({
    model: MODELS.quality,
    max_tokens: 900,
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
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            corrections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  original: { type: "string" },
                  corrected: { type: "string" },
                  why: { type: "string" },
                  tag: { type: "string" },
                },
                required: ["original", "corrected", "why", "tag"],
                additionalProperties: false,
              },
            },
          },
          required: ["corrections"],
          additionalProperties: false,
        },
      },
    },
  });

  try {
    return (JSON.parse(text(msg)) as { corrections: Correction[] }).corrections;
  } catch {
    return [];
  }
}

export type Correction = {
  original: string;
  corrected: string;
  why: string;
  tag: string;
};

// ---------------------------------------------------------------- writing

export async function correctWriting(opts: {
  level: string;
  prompt: string;
  body: string;
}) {
  const msg = await client().messages.create({
    model: MODELS.quality,
    max_tokens: 1500,
    system: `You correct short German texts by a ${opts.level} learner.

Be encouraging but accurate. Rules:
- Only flag real errors. Do not rewrite correct German into your preferred style.
- "natural" is a rewrite of their text as a native would put it, staying at
  their level — do not introduce vocabulary or structures above ${opts.level}.
- Explain each correction in one plain-English sentence.
- tag must be one of: article-gender, article-akkusativ, verb-ending,
  verb-position-2, verb-final, plural, negation, pronoun, capitalisation,
  spelling, word-order, vocabulary.`,
    messages: [
      { role: "user", content: `Task: ${opts.prompt}\n\nTheir text:\n${opts.body}` },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            corrections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  original: { type: "string" },
                  corrected: { type: "string" },
                  why: { type: "string" },
                  tag: { type: "string" },
                },
                required: ["original", "corrected", "why", "tag"],
                additionalProperties: false,
              },
            },
            natural: { type: "string" },
            encouragement: { type: "string" },
          },
          required: ["corrections", "natural", "encouragement"],
          additionalProperties: false,
        },
      },
    },
  });

  return JSON.parse(text(msg)) as {
    corrections: Correction[];
    natural: string;
    encouragement: string;
  };
}

// ---------------------------------------------------------------- explanations

/**
 * Break a German sentence down for a learner at `level`.
 *
 * Cache-miss path only — the caller stores the result (spec §12). German
 * learners look up the same sentences, so this table converges and the live
 * cost decays toward zero, which is what keeps the whole thing inside €10.
 */
export async function explainSentence(sentence: string, level: string) {
  const msg = await client().messages.create({
    model: MODELS.cheap,
    max_tokens: 500,
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
  return text(msg);
}

/** Cache-miss path only — the result is stored by the caller (spec §12). */
export async function explainMistake(expected: string, got: string, tags: string[]) {
  const msg = await client().messages.create({
    model: MODELS.cheap,
    max_tokens: 250,
    system: `Explain one German mistake to a beginner in 2-3 short sentences of
plain English. State what the rule is, not just what the right answer is.
No preamble, no "Great question!", no markdown headings.`,
    messages: [
      {
        role: "user",
        content: `Correct: ${expected}\nThey wrote: ${got}\nLikely issue: ${tags.join(", ") || "unknown"}`,
      },
    ],
  });
  return text(msg);
}
