"use client";

import { useCallback, useEffect, useState } from "react";
import { playAudio } from "@/lib/speech";
import Noun, { ArticleWord } from "@/components/Article";
import { Card, Eyebrow, Progress, PrimaryButton, Option, record, type BlockProps } from "./shared";

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
 * Introducing new words — not a test. Show it, hear it, see it in a sentence,
 * then one recognition check so the word enters FSRS with a real first rep.
 */
export default function NewVocabBlock({ payload, onDone }: BlockProps<Payload>) {
  // Index, phase and selection move together when the word changes, so they
  // live in one state object. Splitting them forced a reset effect that
  // rendered the new word in the previous word's phase for one frame.
  const [s, setS] = useState<{ i: number; phase: "show" | "check"; picked: string | null }>({
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

  if (!w) return null;

  const options = [w, ...payload.words.filter((x) => x.id !== w.id).slice(0, 3)]
    .map((x) => x.en)
    .sort();

  const isNoun = w.pos === "noun" && w.article;
  const forms = w.forms_json ? (JSON.parse(w.forms_json) as Record<string, string>) : null;

  async function choose(en: string) {
    setS((p) => ({ ...p, picked: en }));
    const correct = en === w.en;
    await record({ kind: "new-vocab", refId: w.id, correct, answer: en, expected: w.en });
    // Advance and reset the phase in one transition.
    setTimeout(
      () => setS((p) => ({ i: p.i + 1, phase: "show", picked: null })),
      correct ? 550 : 1600,
    );
  }

  const { phase, picked } = s;

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
          Heute nur {total} statt 12 neue Wörter. Deine Wiederholungen der letzten
          Woche lagen bei {payload.pacing.accuracy}% — erst das Alte festigen, dann
          Neues drauflegen.
        </p>
      )}

      <Card>
        <h2 className="font-serif text-center text-[40px] leading-tight font-semibold tracking-[-0.015em] md:text-[52px]">
          <Noun article={isNoun ? w.article : null}>{w.lemma}</Noun>
        </h2>

        {phase === "show" && (
          <>
            <p className="font-serif text-secondary mt-3 text-center text-[24px]">{w.en}</p>
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
                <span className="text-[10px]">▶</span> Audio <span className="kbd">R</span>
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
              <PrimaryButton onClick={() => setS((p) => ({ ...p, phase: "check" }))}>
                Verstanden
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
              {options.map((o) => (
                <Option
                  key={o}
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
