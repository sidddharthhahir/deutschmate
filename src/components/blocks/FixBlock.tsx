"use client";

import { useState } from "react";
import {
  Card,
  Eyebrow,
  Progress,
  Option,
  Verdict,
  SkipLink,
  record,
  type BlockProps,
} from "./shared";
import { de } from "@/lib/tags";

type Drill = {
  q: string;
  options: string[];
  a: number;
  why: string;
  from: string;
  slug: string;
};
type Payload = {
  tags: { tag: string; n: number; label: string }[];
  drills: Drill[];
};

/** The Fix block. */
export default function FixBlock({
  payload,
  onDone,
  onSkip,
}: BlockProps<Payload>) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const drills = payload.drills ?? [];
  const d = drills[i];

  if (!drills.length || !d) {
    onDone();
    return null;
  }

  async function choose(n: number) {
    setPicked(n);
    const correct = n === d.a;
    await record({
      kind: "fix",
      refId: d.slug,
      correct,
      answer: d.options[n],
      expected: d.options[d.a],
    });
    setTimeout(
      () => {
        setPicked(null);
        setI((x) => x + 1);
      },
      correct ? 700 : 2400,
    );
  }

  return (
    <div>
      <Progress done={i} total={drills.length} />

      <div className="border-line-sub bg-raised mb-5 rounded-xl border p-4">
        <p className="font-mono text-accent/80 text-[11px] tracking-[0.14em] uppercase">
          Deine häufigsten Fehler
        </p>
        <ul className="mt-2.5 space-y-1.5">
          {payload.tags.map((t) => (
            <li
              key={t.tag}
              className="text-secondary flex justify-between text-[14px]"
            >
              {/* de(), not t.label — the label is the English description that
                  goes into a model prompt, and this is a German screen. */}
              <span>{de(t.tag)}</span>
              <span className="font-mono text-muted">{t.n}×</span>
            </li>
          ))}
        </ul>
      </div>

      <Card>
        <Eyebrow>{d.from}</Eyebrow>
        <p className="font-serif mb-6 text-center text-[22px]">{d.q}</p>
        <div className="space-y-2">
          {d.options.map((o, n) => (
            <Option
              key={n}
              onClick={() => void choose(n)}
              state={
                picked === null
                  ? "idle"
                  : n === d.a
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
        {picked !== null && <Verdict ok={picked === d.a} why={d.why} />}
      </Card>

      <SkipLink onSkip={onSkip} />
    </div>
  );
}
