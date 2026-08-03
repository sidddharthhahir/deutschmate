"use client";

import { useEffect, useState } from "react";
import { Card, Eyebrow, Progress, Option, Verdict, record, type BlockProps } from "./shared";

type Q = { q: string; options: string[]; a: number; why?: string; refId?: string };
type Payload = { unitId: string | null };

/**
 * Abschluss — eight questions built from what you actually touched today.
 * A last retrieval pass before the recap, not a graded test.
 */
export default function QuizBlock({ payload, onDone }: BlockProps<Payload>) {
  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    fetch(`/api/quiz${payload.unitId ? `?unit=${payload.unitId}` : ""}`)
      .then((r) => r.json())
      .then((d) => setQuestions(d.questions ?? []))
      .catch(() => setQuestions([]));
  }, [payload.unitId]);

  useEffect(() => {
    if (questions && questions.length === 0) onDone();
  }, [questions, onDone]);

  if (!questions) return <p className="font-mono text-muted text-center text-sm">…</p>;

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
          Zum Tagesabschluss
        </button>
      </Card>
    );
  }

  async function choose(n: number) {
    setPicked(n);
    const correct = n === q.a;
    if (correct) setScore((s) => s + 1);
    await record({
      kind: "quiz",
      refId: q.refId,
      correct,
      answer: q.options[n],
      expected: q.options[q.a],
    });
    setTimeout(() => {
      setPicked(null);
      setI((x) => x + 1);
    }, correct ? 600 : 1800);
  }

  return (
    <div>
      <Progress done={i} total={questions.length} />
      <Eyebrow>
        Abschluss · {i + 1} / {questions.length}
      </Eyebrow>
      <Card>
        <p className="font-serif mb-6 text-center text-[24px]">{q.q}</p>
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
        {picked !== null && q.why && <Verdict ok={picked === q.a} why={q.why} />}
      </Card>
    </div>
  );
}
