"use client";

import { useEffect, useState } from "react";
import {
  Card,
  Eyebrow,
  Progress,
  Option,
  Verdict,
  ScoreCard,
  record,
  useChoiceKeys,
  useAdvanceKey,
  useMultipleChoice,
  type BlockProps,
} from "./shared";

type Q = {
  q: string;
  options: string[];
  a: number;
  why?: string;
  refId?: string;
};
type Payload = { unitId: string | null };

/** Abschluss — eight questions built from what you actually touched today. */
export default function QuizBlock({ payload, onDone }: BlockProps<Payload>) {
  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const { picked, setPicked, settle } = useMultipleChoice({
    correct: 600,
    wrong: 1800,
  });

  useEffect(() => {
    fetch(`/api/quiz${payload.unitId ? `?unit=${payload.unitId}` : ""}`)
      .then((r) => r.json())
      .then((d) => setQuestions(d.questions ?? []))
      .catch(() => setQuestions([]));
  }, [payload.unitId]);

  useEffect(() => {
    if (questions && questions.length === 0) onDone();
  }, [questions, onDone]);

  const q = questions?.[i];

  /* Above the early returns, because hooks cannot be called conditionally.
     Each is enabled only for the screen it belongs to. */
  useChoiceKeys(
    q?.options.length ?? 0,
    (n) => void choose(n),
    Boolean(q) && picked === null,
  );
  useAdvanceKey(onDone, Boolean(questions) && !q);

  if (!questions)
    return <p className="font-mono text-muted text-center text-sm">…</p>;

  if (!q) {
    return (
      <ScoreCard
        score={score}
        total={questions.length}
        onDone={onDone}
        cta="Zum Tagesabschluss"
      />
    );
  }

  async function choose(n: number) {
    if (!q) return;
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
    settle(correct, () => setI((x) => x + 1));
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
              n={n + 1}
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
        {picked !== null && q.why && (
          <Verdict ok={picked === q.a} why={q.why} />
        )}
      </Card>
    </div>
  );
}
