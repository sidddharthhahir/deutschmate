"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speak } from "@/lib/speech";
import { modalIsOpen } from "@/lib/keys";
import { GermanInput, type GermanFieldHandle } from "@/components/GermanInput";
import ExplainSentence from "@/components/ExplainSentence";
import { Card, Eyebrow, Progress, SkipLink, type BlockProps } from "./shared";

type ClozeCard = {
  cardId: number;
  id: number;
  sentence: string;
  answer: string;
  full: string;
  en: string | null;
  source: string;
  tag: string | null;
};

type Payload = { cards: ClozeCard[] };

const SOURCE_LABEL: Record<string, string> = {
  error: "aus deinem Fehler",
  reading: "aus deinem Lesetext",
  manual: "aus deinen Problemwörtern",
};

const TAG_LABEL: Record<string, string> = {
  "article-gender": "Artikel",
  "article-akkusativ": "Akkusativ",
  "verb-ending": "Verbendung",
  "verb-position-2": "Verbstellung",
  "verb-final": "Infinitiv am Ende",
  plural: "Plural",
  negation: "nicht / kein",
  pronoun: "Pronomen",
  capitalisation: "Großschreibung",
  spelling: "Rechtschreibung",
  "word-order": "Wortstellung",
  vocabulary: "Wortwahl",
};

const norm = (s: string) =>
  s.trim().replace(/[.,!?;:]/g, "").replace(/\s+/g, " ");

/**
 * Lücken — fill the gap.
 *
 * Every card here came from something the learner did: a sentence they got
 * wrong, or a line they tapped while reading. Nothing was authored for it, and
 * the block says where each one came from — a drill you can trace back to your
 * own mistake is worth more than a drill that arrived from nowhere.
 *
 * Typed, not multiple choice. Recall with four options in front of you is
 * recognition wearing a costume; the whole point of the gap is producing the
 * word from nothing.
 */
export default function ClozeBlock({ payload, onDone, onSkip }: BlockProps<Payload>) {
  const cards = payload.cards ?? [];
  const [i, setI] = useState(0);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<"right" | "close" | "wrong" | null>(null);
  const input = useRef<GermanFieldHandle>(null);

  const card = cards[i];

  useEffect(() => {
    if (!cards.length) onDone();
  }, [cards.length, onDone]);

  // Refocus on every card, including after a wrong answer — the hand should
  // never have to find the mouse between gaps.
  useEffect(() => {
    if (!result) input.current?.focus();
  }, [i, result]);

  const grade = useCallback(
    (g: number, typed: string) => {
      if (!card) return;
      void fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.cardId,
          grade: g,
          answer: typed || "—",
          expected: card.answer,
        }),
      });
    },
    [card],
  );

  const check = useCallback(() => {
    if (!card || result) return;
    const typed = norm(value);
    const want = norm(card.answer);
    if (!typed) return;

    if (typed === want) {
      setResult("right");
      grade(3, value);
    } else if (typed.toLocaleLowerCase("de") === want.toLocaleLowerCase("de")) {
      // Right word, wrong case. In German that IS a mistake, but it is a
      // different mistake from not knowing the word — graded Hard, not Again.
      setResult("close");
      grade(2, value);
    } else {
      setResult("wrong");
      grade(1, value);
    }
    speak(card.full);
  }, [card, value, result, grade]);

  const reveal = useCallback(() => {
    if (!card || result) return;
    setResult("wrong");
    grade(1, "");
    speak(card.full);
  }, [card, result, grade]);

  const next = useCallback(() => {
    setValue("");
    setResult(null);
    if (i + 1 >= cards.length) onDone();
    else setI((n) => n + 1);
  }, [i, cards.length, onDone]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter") return;
      // The answer field is an input, so Enter inside it reaches this listener
      // by bubbling — that is intended. What must NOT reach it is Enter typed
      // into some other field, or into an overlay covering this block.
      if (modalIsOpen()) return;
      e.preventDefault();
      if (result) next();
      else check();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, next, check]);

  if (!card) return null;

  const [before, after] = card.sentence.split("___");

  return (
    <div>
      <Progress done={i} total={cards.length} />
      <Eyebrow>
        Lücken · {i + 1} von {cards.length}
      </Eyebrow>

      {/* key remounts per card so the entrance replays, matching the review block. */}
      <div key={card.id} className="dm-rise">
        <Card>
          <p className="font-mono text-muted mb-5 text-center text-[11.5px]">
            {SOURCE_LABEL[card.source] ?? card.source}
            {card.tag && ` · ${TAG_LABEL[card.tag] ?? card.tag}`}
          </p>

          <p className="font-serif mx-auto max-w-[46ch] text-center text-[24px] leading-[1.55] md:text-[28px]">
            {before}
            <span
              className={`mx-1 inline-block min-w-[5ch] border-b-2 pb-0.5 text-center transition-colors ${
                result === null
                  ? "border-line-strong text-muted"
                  : result === "right"
                    ? "border-accent text-accent"
                    : result === "close"
                      ? "border-die text-die"
                      : "border-das text-das"
              }`}
            >
              {result ? card.answer : " "}
            </span>
            {after}
          </p>

          {card.en && (
            <p className="text-muted mt-4 text-center text-[14px]">{card.en}</p>
          )}

          <div className="mx-auto mt-7 max-w-[420px]">
            <GermanInput
              ref={input}
              value={result ? "" : value}
              onChange={setValue}
              disabled={result !== null}
              placeholder="fehlendes Wort"
              ariaLabel="Fehlendes Wort"
              className="border-line bg-bg text-fg focus:border-line-strong placeholder:text-muted/50 font-serif w-full rounded-xl border px-4 py-3.5 text-center text-[19px] outline-none transition-colors disabled:opacity-40"
            />
          </div>

          {result && (
            <div
              className={`mx-auto mt-5 max-w-[460px] rounded-xl border p-4 text-center text-[14px] ${
                result === "wrong" ? "dm-nudge" : "dm-fade"
              } ${
                result === "right"
                  ? "border-[#2F4A34] bg-[#18251B] text-[#CFE3C8]"
                  : result === "close"
                    ? "border-[#4A422F] bg-[#25211A] text-[#E8DCC8]"
                    : "border-[#4A2F3D] bg-[#251A20] text-[#E8C8D6]"
              }`}
            >
              <p className="font-medium">
                {result === "right"
                  ? "Richtig"
                  : result === "close"
                    ? "Fast — Großschreibung"
                    : "Nicht ganz"}
              </p>
              <p className="font-serif text-fg mt-2 text-[17px]">{card.full}</p>
              {result !== "right" && value.trim() && (
                <p className="text-muted mt-1.5 font-mono text-[12px]">
                  du: {value.trim()}
                </p>
              )}
              {/* Only offered when you got it wrong — that is the moment the
                  rule is worth reading, and it keeps the right-answer path fast. */}
              {result !== "right" && <ExplainSentence sentence={card.full} compact />}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 flex gap-2.5">
        {result ? (
          <button
            onClick={next}
            className="bg-fg flex-1 rounded-xl py-4 font-medium text-[#16211E] transition-colors hover:bg-white"
          >
            Weiter <span className="kbd ml-2">Enter</span>
          </button>
        ) : (
          <>
            <button
              onClick={reveal}
              className="border-line text-secondary hover:border-line-strong hover:text-fg flex-none rounded-xl border px-5 py-4 text-[14px] transition-colors"
            >
              Weiß ich nicht
            </button>
            <button
              onClick={check}
              // norm(), not trim(): check() ignores an answer that is only
              // punctuation, so an enabled button that silently does nothing
              // would look like the app had frozen.
              disabled={!norm(value)}
              className="bg-fg flex-1 rounded-xl py-4 font-medium text-[#16211E] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-[#243330] disabled:text-[#5C6B65]"
            >
              Prüfen <span className="kbd ml-2">Enter</span>
            </button>
          </>
        )}
      </div>

      <SkipLink onSkip={onSkip} />
    </div>
  );
}
