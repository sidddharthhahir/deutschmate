"use client";

import { useState } from "react";
import GermanText from "@/components/GermanText";
import { Card, Eyebrow, Progress, Option, Verdict, SkipLink, record, type BlockProps } from "./shared";

type Question = { q: string; options: string[]; a: number };
type Payload = {
  id: string;
  title: string;
  body: string;
  wordCount: number;
  questions: Question[];
  glossary: Record<string, string>;
  /** Set when this is a revisit: which unit the text originally came from. */
  from?: string | null;
};

/**
 * Reading. Tap any word for a gloss; read first, answer after.
 *
 * Line length is capped at ~62 characters — an hour of German at full window
 * width would be unreadable, and this is the block people spend longest on.
 *
 * The text surface itself lives in GermanText, shared with the paste-your-own
 * page. Tapping words is the second-most-used interaction in the app and two
 * copies of it would drift.
 */
export default function ReadingBlock({ payload, onDone, onSkip }: BlockProps<Payload>) {
  const [phase, setPhase] = useState<"read" | "quiz">("read");
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const questions = payload.questions ?? [];

  if (phase === "read") {
    return (
      <div>
        <Eyebrow>
          {payload.from ? "Wiederlesen" : "Lesen"} · {payload.wordCount} Wörter
        </Eyebrow>
        <Card>
          <h2 className="font-serif mb-2 text-center text-[26px] font-semibold">
            {payload.title}
          </h2>
          {/* Says why an old text turned up, so it reads as revision rather
              than as the app having lost its place. */}
          {payload.from && (
            <p className="font-mono text-muted mb-6 text-center text-[11.5px]">
              schon gelesen · {payload.from}
            </p>
          )}
          {!payload.from && <div className="mb-6" />}

          <GermanText
            body={payload.body}
            sourceRef={payload.id}
            glossary={payload.glossary}
          />
        </Card>

        <button
          onClick={() => (questions.length ? setPhase("quiz") : onDone())}
          className="bg-fg mt-4 w-full rounded-xl py-4 font-medium text-[#16211E] transition-colors hover:bg-white"
        >
          {questions.length ? `Fragen beantworten (${questions.length})` : "Weiter"}
        </button>
        <SkipLink onSkip={onSkip} />
      </div>
    );
  }

  const q = questions[i];
  if (!q) {
    return (
      <Card>
        <p className="font-serif text-center text-[44px] font-semibold">
          {score}
          <span className="text-muted text-[24px]">/{questions.length}</span>
        </p>
        <p className="font-mono text-muted mt-2 text-center text-[12px] tracking-[0.08em] uppercase">
          richtig
        </p>
        <button
          onClick={onDone}
          className="bg-fg mt-7 w-full rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
        >
          Weiter
        </button>
      </Card>
    );
  }

  async function choose(n: number) {
    setPicked(n);
    const correct = n === q.a;
    if (correct) setScore((s) => s + 1);
    await record({
      kind: "reading",
      refId: payload.id,
      correct,
      answer: q.options[n],
      expected: q.options[q.a],
    });
    setTimeout(() => {
      setPicked(null);
      setI((x) => x + 1);
    }, correct ? 650 : 1700);
  }

  return (
    <div>
      <Progress done={i} total={questions.length} />
      <Eyebrow>{payload.title}</Eyebrow>
      <Card>
        <p className="font-serif mb-6 text-center text-[22px]">{q.q}</p>
        <div className="space-y-2">
          {q.options.map((o, n) => (
            <Option
              key={n}
              onClick={() => void choose(n)}
              state={
                picked === null
                  ? "idle"
                  : n === q.a
                    ? "correct"
                    : picked === n
                      ? "wrong"
                      : "dimmed"
              }
            >
              {o}
            </Option>
          ))}
        </div>
        {picked !== null && picked !== q.a && <Verdict ok={false} expected={q.options[q.a]} />}
      </Card>
      <button
        onClick={() => setPhase("read")}
        className="font-mono text-muted hover:text-secondary mt-4 w-full text-center text-[11.5px] transition-colors"
      >
        ← Text nochmal lesen
      </button>
    </div>
  );
}
