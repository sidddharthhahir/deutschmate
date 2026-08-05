"use client";

import { useEffect, useState } from "react";
import { speak } from "@/lib/speech";
import {
  Card,
  Eyebrow,
  Progress,
  Verdict,
  SkipLink,
  SentenceCredit,
  record,
  type BlockProps,
} from "./shared";

type Item = {
  wordId: string;
  en: string;
  answer: string;
  tokens: string[];
  punctuation: string;
  credit?: string | null;
};
type Payload = { items: Item[] };

/**
 * The sentence builder. Explanations come from the write-through cache — rule first, cached
 * second, a model call only on a genuine miss.
 */
export default function BuilderBlock({
  payload,
  onDone,
  onSkip,
}: BlockProps<Payload>) {
  const items = payload.items ?? [];

  /** One state object rather than five. */
  const [s, setS] = useState(() => ({
    i: 0,
    pool: items[0]?.tokens ?? [],
    placed: [] as string[],
    checked: false,
    explanation: undefined as string | undefined,
  }));
  const [busy, setBusy] = useState(false);

  const it = items[s.i];

  useEffect(() => {
    if (items.length && !it) onDone();
  }, [it, items.length, onDone]);

  if (!it) return null;

  const { pool, placed, checked, explanation } = s;
  const attempt = placed.join(" ") + it.punctuation;
  const correct = attempt.toLowerCase() === it.answer.toLowerCase();

  async function check() {
    setS((p) => ({ ...p, checked: true }));
    setBusy(true);
    if (correct) speak(it.answer);
    const res = await record({
      kind: "builder",
      refId: it.wordId,
      correct,
      answer: attempt,
      expected: it.answer,
      explain: !correct,
    });
    setS((p) => ({ ...p, explanation: res.explanation }));
    setBusy(false);
  }

  /** Advance and rebuild the tiles in one transition — no intermediate frame. */
  function next() {
    setS((p) => ({
      i: p.i + 1,
      pool: items[p.i + 1]?.tokens ?? [],
      placed: [],
      checked: false,
      explanation: undefined,
    }));
  }

  return (
    <div>
      <Progress done={s.i} total={items.length} />
      <Eyebrow>
        Sätze bauen · {s.i + 1} / {items.length}
      </Eyebrow>

      <Card>
        <p className="text-secondary text-center text-[19px]">{it.en}</p>

        {/* answer slot */}
        <div className="border-line bg-bg mt-6 flex min-h-[72px] flex-wrap content-start items-start justify-center gap-2 rounded-xl border border-dashed p-3">
          {placed.length === 0 && (
            <span className="font-mono text-muted self-center text-[12px]">
              Wörter hier anordnen
            </span>
          )}
          {placed.map((t, n) => (
            <button
              key={`${t}-${n}`}
              disabled={checked}
              onClick={() =>
                setS((p) => ({
                  ...p,
                  placed: p.placed.filter((_, x) => x !== n),
                  pool: [...p.pool, t],
                }))
              }
              className="bg-fg font-serif rounded-lg px-3.5 py-2 text-[17px] text-[#16211E] transition-transform hover:-translate-y-0.5 disabled:opacity-70"
            >
              {t}
            </button>
          ))}
          {placed.length > 0 && (
            <span className="font-serif text-muted self-center text-[19px]">
              {it.punctuation}
            </span>
          )}
        </div>

        {/* pool */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {pool.map((t, n) => (
            <button
              key={`${t}-${n}`}
              disabled={checked}
              onClick={() =>
                setS((p) => ({
                  ...p,
                  pool: p.pool.filter((_, x) => x !== n),
                  placed: [...p.placed, t],
                }))
              }
              className="border-line-strong text-fg hover:bg-raised font-serif rounded-lg border px-3.5 py-2 text-[17px] transition-all hover:-translate-y-0.5 disabled:opacity-40"
            >
              {t}
            </button>
          ))}
        </div>

        {!checked ? (
          <div className="mt-6 flex gap-2">
            <button
              onClick={() =>
                setS((p) => ({ ...p, pool: it.tokens, placed: [] }))
              }
              className="border-line text-secondary hover:border-line-strong hover:text-fg rounded-xl border px-5 py-3.5 text-[14px] transition-colors"
            >
              Zurücksetzen
            </button>
            <button
              onClick={() => void check()}
              disabled={pool.length > 0}
              className="bg-fg flex-1 rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white disabled:bg-[#243330] disabled:text-[#5C6B65]"
            >
              Prüfen
            </button>
          </div>
        ) : (
          <>
            <Verdict
              ok={correct}
              expected={correct ? undefined : it.answer}
              why={busy ? "…" : explanation}
            />
            <SentenceCredit credit={it.credit} />
            <button
              onClick={next}
              className="bg-fg mt-4 w-full rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
            >
              Weiter
            </button>
          </>
        )}
      </Card>

      <SkipLink onSkip={onSkip} />
    </div>
  );
}
