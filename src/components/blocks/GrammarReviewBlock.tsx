"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { send } from "@/lib/outbox";
import {
  Card,
  Eyebrow,
  Progress,
  Option,
  Verdict,
  SkipLink,
  type BlockProps,
} from "./shared";

type Drill = { q: string; options: string[]; a: number; why: string };
type GrammarCard = {
  cardId: number;
  grammarId: string;
  slug: string;
  title: string;
  level: string;
  drills: Drill[];
  reps: number;
  lapses: number;
};

type Payload = { cards: GrammarCard[] };

/** Grammatik-Wiederholung. */
export default function GrammarReviewBlock({
  payload,
  onDone,
  onSkip,
}: BlockProps<Payload>) {
  const cards = payload.cards ?? [];
  const [i, setI] = useState(0);
  const [d, setD] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);

  const card = cards[i];
  // Two questions is enough to tell "knows the rule" from "guessed once", and
  // short enough that grammar review never crowds out the rest of the session.
  const drills = card?.drills.slice(0, 2) ?? [];
  const drill = drills[d];

  useEffect(() => {
    if (!cards.length) onDone();
  }, [cards.length, onDone]);

  if (!card || !drill) return null;

  function finishCard(correctCount: number) {
    // 2/2 → Good, 1/2 → Hard, 0/2 → Again. Easy is deliberately unreachable:
    // getting two multiple-choice drills right is not evidence of "sofort".
    const grade = correctCount === drills.length ? 3 : correctCount > 0 ? 2 : 1;
    void send("/api/review", { cardId: card.cardId, grade });

    if (i + 1 >= cards.length) onDone();
    else {
      setI((n) => n + 1);
      setD(0);
      setRight(0);
      setPicked(null);
    }
  }

  function choose(n: number) {
    if (picked !== null) return;
    setPicked(n);
    const ok = n === drill.a;
    const total = right + (ok ? 1 : 0);
    setRight(total);

    // Log it like any other attempt so grammar mistakes reach the Fix block.
    void send("/api/attempt", {
      kind: "grammar-review",
      refId: card.grammarId,
      correct: ok,
      answer: drill.options[n],
      expected: drill.options[drill.a],
    });

    setTimeout(
      () => {
        if (d + 1 >= drills.length) finishCard(total);
        else {
          setD((x) => x + 1);
          setPicked(null);
        }
      },
      ok ? 700 : 2400,
    );
  }

  return (
    <div>
      <Progress
        done={i * drills.length + d}
        total={cards.length * drills.length}
      />
      <Eyebrow>
        Grammatik-Wiederholung · {i + 1} von {cards.length}
      </Eyebrow>

      <div key={`${card.cardId}-${d}`} className="dm-rise">
        <Card>
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <span className="font-serif text-[19px] font-medium">
              {card.title}
            </span>
            <span className="font-mono text-muted flex-none text-[11px]">
              {card.level}
              {card.lapses > 0 && ` · ${card.lapses}× vergessen`}
            </span>
          </div>

          <p className="font-serif mb-6 text-center text-[22px]">{drill.q}</p>

          <div className="space-y-2">
            {drill.options.map((o, n) => (
              <Option
                key={n}
                onClick={() => choose(n)}
                state={
                  picked === null
                    ? "idle"
                    : n === drill.a
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

          {picked !== null && (
            <Verdict ok={picked === drill.a} why={drill.why} />
          )}

          {picked !== null && picked !== drill.a && (
            <Link
              href={`/grammatik/${card.slug}`}
              className="text-accent mt-4 block text-center text-[13px] hover:underline"
            >
              Regel nachlesen: {card.title} →
            </Link>
          )}
        </Card>
      </div>

      <SkipLink onSkip={onSkip} />
    </div>
  );
}
