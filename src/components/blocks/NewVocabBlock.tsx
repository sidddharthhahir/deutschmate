"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { playAudio } from "@/lib/speech";
import { shouldIgnoreKey } from "@/lib/keys";
import { fourChoices } from "@/lib/choices";
import Noun, { ArticleWord } from "@/components/Article";
import {
  Card,
  Eyebrow,
  Progress,
  PrimaryButton,
  Option,
  record,
  type BlockProps,
} from "./shared";

type Word = {
  id: string;
  lemma: string;
  article: string | null;
  plural: string | null;
  pos: string;
  en: string;
  audio_url: string | null;
  forms_json: string | null;
  example_de: string | null;
  example_en: string | null;
  mnemonic: string | null;
};

type Payload = {
  words: Word[];
  unit: string;
  /** Why today's count is what it is. Set when the pace was cut. */
  pacing?: { words: number; accuracy: number | null; reduced: boolean };
};

/**
 * Introducing new words: show the word with its meaning, then check the meaning
 * landed. The check is a four-way recognition question, and it IS recorded —
 * `record({ kind: "new-vocab" })` feeds the accuracy that newWordBudget uses to
 * cut tomorrow's pace. Worth saying, because the doorway card for this block
 * used to claim nothing here was graded.
 */
export default function NewVocabBlock({
  payload,
  onDone,
}: BlockProps<Payload>) {
  // Index, phase and selection move together when the word changes, so they
  // live in one state object. Splitting them forced a reset effect that
  // rendered the new word in the previous word's phase for one frame.
  const [s, setS] = useState<{
    i: number;
    phase: "show" | "check";
    picked: string | null;
  }>({
    i: 0,
    phase: "show",
    picked: null,
  });

  const w = payload.words[s.i];
  const total = payload.words.length;

  const play = useCallback(() => {
    if (w) playAudio(w.audio_url, w.lemma);
  }, [w]);

  useEffect(() => {
    play();
  }, [play]);

  useEffect(() => {
    if (!w) onDone();
  }, [w, onDone]);

  /* Three distractors and the answer — see lib/choices.ts for why it is not
     just "the next three words in the list". Memoised because the key handler
     below lists it as a dependency, and a fresh array every render would
     re-bind the listener on every render. */
  const options = useMemo(
    () => (w ? fourChoices(w, payload.words) : []),
    [w, payload.words],
  );

  const { phase, picked } = s;

  const choose = useCallback(
    async (en: string) => {
      if (!w) return;
      setS((p) => ({ ...p, picked: en }));
      const correct = en === w.en;
      await record({
        kind: "new-vocab",
        refId: w.id,
        correct,
        answer: en,
        expected: w.en,
      });
      // Advance and reset the phase in one transition.
      setTimeout(
        () => setS((p) => ({ i: p.i + 1, phase: "show", picked: null })),
        correct ? 550 : 1600,
      );
    },
    [w],
  );

  /*
   * The same keys the rest of the session uses. The tour teaches "your hand
   * never leaves the number row" and this block — the one a learner meets on
   * day one and most days after — was entirely mouse-driven: twelve words,
   * twenty-four clicks. Enter or Space to turn the card, 1–4 to answer, R to
   * hear it again, matching ReviewBlock so nothing has to be relearned.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!w || shouldIgnoreKey(e)) return;
      if (phase === "show") {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setS((p) => ({ ...p, phase: "check" }));
        } else if (e.key === "r" || e.key === "R") play();
        return;
      }
      if (picked) return; // already answered; the card is about to advance
      if (e.key === "r" || e.key === "R") {
        play();
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        const opt = options[Number(e.key) - 1];
        if (opt) void choose(opt);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [w, phase, picked, options, choose, play]);

  if (!w) return null;

  const isNoun = w.pos === "noun" && w.article;
  const forms = w.forms_json
    ? (JSON.parse(w.forms_json) as Record<string, string>)
    : null;

  return (
    <div>
      <Progress done={s.i} total={total} />
      <Eyebrow>
        Neues Wort {s.i + 1} / {total} · {payload.unit}
      </Eyebrow>

      {/* The app slowed itself down — say so, and say why. Quietly giving
          someone less and letting them think it's normal is a small lie. */}
      {payload.pacing?.reduced && s.i === 0 && (
        <p className="border-line-sub bg-raised text-secondary mx-auto mb-4 max-w-[52ch] rounded-xl border px-4 py-3 text-center text-[13px] leading-relaxed">
          Heute nur {total} statt 12 neue Wörter. Deine Wiederholungen der
          letzten Woche lagen bei {payload.pacing.accuracy}% — erst das Alte
          festigen, dann Neues drauflegen.
        </p>
      )}

      <Card>
        <h2 className="font-serif text-center text-[40px] leading-tight font-semibold tracking-[-0.015em] md:text-[52px]">
          <Noun article={isNoun ? w.article : null}>{w.lemma}</Noun>
        </h2>

        {phase === "show" && (
          <>
            <p className="font-serif text-secondary mt-3 text-center text-[24px]">
              {w.en}
            </p>
            {isNoun && w.plural && (
              <p className="font-mono text-muted mt-1.5 text-center text-[13px]">
                Plural: <ArticleWord article="die" /> {w.plural}
              </p>
            )}

            <div className="mt-5 text-center">
              <button
                onClick={play}
                className="border-line text-secondary hover:border-line-strong hover:text-fg inline-flex items-center gap-2.5 rounded-full border px-5 py-2.5 text-[14px] transition-colors"
              >
                <span className="text-[10px]">▶</span> Audio{" "}
                <span className="kbd">R</span>
              </button>
            </div>

            {w.example_de && (
              <div className="bg-bg border-line-sub mt-7 rounded-xl border p-4 text-center">
                <p className="font-serif text-fg text-[19px]">{w.example_de}</p>
                <p className="text-muted mt-1 text-[14px]">{w.example_en}</p>
              </div>
            )}

            {forms && (
              <div className="font-mono text-secondary mx-auto mt-5 grid max-w-sm grid-cols-3 gap-x-6 gap-y-1 text-[13px]">
                {Object.entries(forms).map(([p, f]) => (
                  <div key={p} className="flex justify-between gap-2">
                    <span className="text-muted">{p}</span>
                    <span className="text-fg">{f}</span>
                  </div>
                ))}
              </div>
            )}

            {w.mnemonic && (
              <p className="text-accent/80 mt-5 text-center text-[14px] italic">
                {w.mnemonic}
              </p>
            )}

            <div className="mt-8">
              <PrimaryButton
                onClick={() => setS((p) => ({ ...p, phase: "check" }))}
              >
                Verstanden <span className="kbd kbd-hint">Enter</span>
              </PrimaryButton>
            </div>
          </>
        )}

        {phase === "check" && (
          <>
            <p className="font-mono text-muted mt-6 text-center text-[12.5px]">
              Was bedeutet das?
            </p>
            <div className="mt-4 space-y-2">
              {options.map((o, n) => (
                <Option
                  key={o}
                  n={n + 1}
                  onClick={() => void choose(o)}
                  state={
                    !picked
                      ? "idle"
                      : o === w.en
                        ? "correct"
                        : picked === o
                          ? "wrong"
                          : "dimmed"
                  }
                >
                  {o}
                </Option>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
