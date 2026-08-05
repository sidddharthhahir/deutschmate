"use client";

import { useState } from "react";
import { speak } from "@/lib/speech";
import ExplainSentence from "@/components/ExplainSentence";

/**
 * A German text you can work on: tap a word for its meaning, keep the sentence as a gap card, ask
 * what the grammar is doing.
 */

type Gloss = { word: string; meaning: string; sentence: string };
type Mine = "idle" | "saving" | "done" | "dup" | "fail";

const MINE_LABEL: Record<Mine, string> = {
  idle: "Als Lücke merken",
  saving: "…",
  done: "Gemerkt ✓",
  dup: "Hast du schon",
  fail: "Ging nicht",
};

export default function GermanText({
  body,
  sourceRef,
  glossary,
  size = "normal",
}: {
  body: string;
  /** Where this text came from, stored on any card mined from it. */
  sourceRef?: string;
  /** Pre-supplied meanings, checked before the lookup call. */
  glossary?: Record<string, string>;
  size?: "normal" | "compact";
}) {
  const [gloss, setGloss] = useState<Gloss | null>(null);
  const [mine, setMine] = useState<Mine>("idle");

  async function lookup(raw: string, sentence: string) {
    const word = raw.replace(/[.,!?„"»«:;()]/g, "");
    if (!word) return;
    speak(word);
    setMine("idle");

    const g = glossary ?? {};
    const direct =
      g[word] ??
      Object.entries(g).find(
        ([k]) =>
          k.toLowerCase() === word.toLowerCase() || k.endsWith(` ${word}`),
      )?.[1];
    if (direct) return setGloss({ word, meaning: direct, sentence });

    try {
      const res = await fetch(`/api/word?lemma=${encodeURIComponent(word)}`);
      const data = await res.json();
      setGloss({ word, meaning: data.en ?? "—", sentence });
    } catch {
      setGloss({ word, meaning: "—", sentence });
    }
  }

  async function mineSentence() {
    if (!gloss || mine === "saving") return;
    setMine("saving");
    try {
      const res = await fetch("/api/cloze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sentence: gloss.sentence,
          word: gloss.word,
          en: gloss.meaning === "—" ? null : gloss.meaning,
          sourceRef: sourceRef ?? null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; created?: boolean };
      setMine(data.ok ? (data.created ? "done" : "dup") : "fail");
    } catch {
      setMine("fail");
    }
  }

  const text = size === "compact" ? "text-[16px]" : "text-[18px]";

  return (
    <>
      <div
        className={`font-serif mx-auto max-w-[58ch] space-y-4 leading-[1.7] ${text}`}
      >
        {body.split(/\n{2,}/).map((para, n) => (
          <p key={n}>
            {para.split(/(?<=[.!?])\s+/).map((sentence, s) => (
              <span key={s}>
                {sentence.split(/(\s+)/).map((tok, m) =>
                  tok.trim() ? (
                    <span
                      key={m}
                      onClick={() => void lookup(tok, sentence)}
                      className="hover:bg-raised cursor-pointer rounded px-0.5 transition-colors"
                    >
                      {tok}
                    </span>
                  ) : (
                    tok
                  ),
                )}{" "}
              </span>
            ))}
          </p>
        ))}
      </div>

      {gloss && (
        <div className="border-line bg-bg dm-fade mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <div>
            <span className="font-serif text-[18px]">{gloss.word}</span>
            <span className="text-secondary ml-3 text-[15px]">
              {gloss.meaning}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void mineSentence()}
              disabled={mine !== "idle"}
              className={`rounded-full border px-3.5 py-1.5 font-mono text-[11.5px] transition-colors ${
                mine === "done"
                  ? "border-accent text-accent"
                  : mine === "idle"
                    ? "border-line text-secondary hover:border-line-strong hover:text-fg"
                    : "border-line-sub text-muted"
              }`}
            >
              {MINE_LABEL[mine]}
            </button>
            <button
              onClick={() => setGloss(null)}
              className="text-muted hover:text-fg"
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {gloss && <ExplainSentence sentence={gloss.sentence} />}

      <p className="font-mono text-muted mt-6 text-center text-[11.5px]">
        Auf ein Wort tippen für die Bedeutung · „Als Lücke merken“ macht daraus
        eine Karte
      </p>
    </>
  );
}
