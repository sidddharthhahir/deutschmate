"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playAt } from "@/lib/speech";
import { GermanInput, type GermanFieldHandle } from "@/components/GermanInput";
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
  de: string;
  en: string;
  audio: string | null;
  credit?: string | null;
};
type Payload = { items: Item[] };

const SPEEDS = [0.75, 1, 1.25];

/** Hear it, type it. */
export default function ListeningBlock({
  payload,
  onDone,
  onSkip,
}: BlockProps<Payload>) {
  const [i, setI] = useState(0);
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showText, setShowText] = useState(false);
  const [why, setWhy] = useState<string | undefined>();
  const inputRef = useRef<GermanFieldHandle>(null);

  const items = payload.items ?? [];
  const it = items[i];

  const play = useCallback(
    (rate = speed) => {
      if (it) playAt(it.audio, it.de, rate);
    },
    [it, speed],
  );

  useEffect(() => {
    if (it) {
      play();
      inputRef.current?.focus();
    }
  }, [it, play]);

  useEffect(() => {
    if (items.length && !it) onDone();
  }, [it, items.length, onDone]);

  if (!it) return null;

  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[.,!?;:]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const correct = norm(value) === norm(it.de);

  async function check() {
    setChecked(true);
    setShowText(true);
    /* Ask for the "why" on a miss. */
    const res = await record({
      kind: "listening",
      refId: it.wordId,
      correct,
      answer: value,
      expected: it.de,
      explain: !correct,
    });
    setWhy(res.explanation);
  }

  const target = it.de.replace(/[.,!?]/g, "").split(/\s+/);
  const typed = new Set(norm(value).split(" "));

  return (
    <div>
      <Progress done={i} total={items.length} />
      <Eyebrow>
        Hören · {i + 1} / {items.length}
      </Eyebrow>

      <Card>
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={() => play()}
            className="bg-fg flex h-20 w-20 items-center justify-center rounded-full text-2xl text-[#16211E] transition-colors hover:bg-white"
            aria-label="Abspielen"
          >
            ▶
          </button>

          <div className="flex gap-1.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSpeed(s);
                  play(s);
                }}
                className={`font-mono rounded-full px-3 py-1 text-[11.5px] transition-colors ${
                  speed === s
                    ? "bg-line-strong text-fg"
                    : "text-muted hover:bg-raised"
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <GermanInput
            ref={inputRef}
            value={value}
            onChange={setValue}
            onEnter={() => (checked ? next() : void check())}
            disabled={checked}
            placeholder="Was hörst du?"
            ariaLabel="Was hörst du?"
            className="border-line bg-bg font-serif focus:border-line-strong placeholder:text-muted w-full rounded-xl border px-4 py-3.5 text-center text-[19px] outline-none disabled:opacity-60"
          />
        </div>

        {!checked && (
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => setShowText((s) => !s)}
              className="font-mono text-muted hover:text-secondary text-[11.5px] transition-colors"
            >
              {showText ? "Text verstecken" : "Text zeigen"}
            </button>
            <button
              onClick={() => void check()}
              disabled={!value.trim()}
              className="bg-fg rounded-lg px-5 py-2 text-[14px] font-medium text-[#16211E] disabled:bg-[#243330] disabled:text-[#5C6B65]"
            >
              Prüfen
            </button>
          </div>
        )}

        {showText && !checked && (
          <p className="font-serif text-secondary mt-4 text-center text-[18px]">
            {it.de}
          </p>
        )}

        {checked && (
          <>
            {/* Word-level diff — what you missed, not a score. */}
            <div className="mt-6 flex flex-wrap justify-center gap-1.5">
              {target.map((w, n) => (
                <span
                  key={n}
                  className={`font-serif rounded px-2 py-1 text-[18px] ${
                    typed.has(w.toLowerCase())
                      ? "bg-[#1F2A20] text-[#CFE3C8]"
                      : "bg-[#2A1F26] text-[#E8C8D6]"
                  }`}
                >
                  {w}
                </span>
              ))}
            </div>
            <p className="text-muted mt-3 text-center text-[14px]">{it.en}</p>
            <SentenceCredit credit={it.credit} />
            <Verdict
              ok={correct}
              expected={correct ? undefined : it.de}
              why={why}
            />
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

  function next() {
    setValue("");
    setChecked(false);
    setShowText(false);
    setWhy(undefined);
    setI((n) => n + 1);
  }
}
