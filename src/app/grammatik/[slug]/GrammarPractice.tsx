"use client";

import { useState } from "react";
import GrammarBlock from "@/components/blocks/GrammarBlock";

type Props = {
  grammar: { id: string; title: string; explain_md: string };
  examples: { de: string; en: string }[];
  drills: { q: string; options: string[]; a: number; why: string }[];
  level: string;
};

/**
 * Wraps the session's GrammarBlock for standalone browsing, so the reference page and the session
 * render from exactly the same component — one place to change how grammar is presented.
 */
export default function GrammarPractice(props: Props) {
  const [round, setRound] = useState(0);
  const [finished, setFinished] = useState(false);

  if (finished) {
    return (
      <div className="border-line bg-surface rounded-[14px] border p-8 text-center">
        <p className="font-serif text-[24px]">Durch.</p>
        <button
          onClick={() => {
            setRound((r) => r + 1);
            setFinished(false);
          }}
          className="bg-accent dm-pill mt-6 rounded-2xl px-7 py-3.5 font-medium text-accent-fg transition-colors hover:bg-accent-hover"
        >
          Nochmal üben
        </button>
      </div>
    );
  }

  return (
    <>
      <p className="font-mono text-muted mb-4 text-[11.5px] tracking-[0.14em] uppercase">
        {props.level}
      </p>
      <GrammarBlock
        key={round}
        payload={{
          grammar: props.grammar,
          examples: props.examples,
          drills: props.drills,
        }}
        onDone={() => setFinished(true)}
      />
    </>
  );
}
