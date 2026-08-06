"use client";

import { useEffect } from "react";
import Link from "next/link";
import { shouldIgnoreKey } from "@/lib/keys";
import { useCoarsePointer } from "@/lib/hooks";
import type { Intro } from "@/lib/block-intro";

/**
 * The doorway into a block the learner has never done.
 *
 * Shown once per block kind, then never again — the second time you meet
 * Sätze bauen you know what Sätze bauen is, and a card you have to dismiss
 * every day is a card you stop reading. The one-line version stays in the
 * session header forever, for the day you forget.
 */
export default function BlockIntro({
  title,
  intro,
  index,
  total,
  onStart,
}: {
  /** The block's own German name — Aufwärmen, Lücken, Sätze bauen. */
  title: string;
  intro: Intro;
  index: number;
  total: number;
  onStart: () => void;
}) {
  const touch = useCoarsePointer();
  const keys = (touch && intro.touchKeys) || intro.keys;

  /* Enter starts it, the same key that started the session. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreKey(e)) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart]);

  return (
    <main className="bg-bg flex min-h-screen items-center justify-center px-6 py-10">
      <div className="border-line bg-surface w-full max-w-[520px] rounded-[14px] border p-7 md:p-9">
        <p className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase">
          Block {index} von {total} · zum ersten Mal
        </p>

        <h1 className="font-serif break-de mt-2 text-[30px] leading-[1.15] font-semibold">
          {title}
        </h1>
        <p className="text-secondary mt-1.5 text-[15px]">{intro.line}</p>

        <div className="mt-6 flex flex-col gap-3.5">
          {intro.body.map((p) => (
            <p key={p} className="text-secondary text-[14.5px] leading-relaxed">
              {p}
            </p>
          ))}
        </div>

        {/* The touch list where there is one and the pointer is a finger:
            "Leertaste  show the answer" is not advice on a phone. Read from a
            hook rather than CSS because the two lists differ in length, and
            rendering both would leave a gap the width of the hidden one. */}
        {keys && (
          <dl className="border-line-sub mt-6 flex flex-col gap-2 border-t pt-5">
            {keys.map(([k, what]) => (
              <div key={k} className="flex items-baseline gap-3">
                <dt className="w-[104px] flex-none">
                  <span
                    className={
                      touch ? "font-serif text-fg text-[14px]" : "kbd text-fg"
                    }
                  >
                    {k}
                  </span>
                </dt>
                <dd className="font-mono text-muted text-[12px]">{what}</dd>
              </div>
            ))}
          </dl>
        )}

        <button
          onClick={onStart}
          className="bg-fg mt-7 w-full rounded-xl py-4 font-medium text-[#16211E] transition-colors hover:bg-white"
        >
          Los geht&rsquo;s
          <span className="kbd kbd-hint ml-2.5 text-[#43574F]">Enter</span>
        </button>

        {/* Only ever shown once, so the way out has to be on the card itself
            rather than behind a key nobody has been taught yet. */}
        <Link
          href="/"
          className="font-mono text-muted hover:text-secondary mt-4 block w-full text-center text-[11.5px] transition-colors"
        >
          <span className="kbd-hint">Esc&nbsp;&nbsp;</span>Beenden
        </Link>
      </div>
    </main>
  );
}
