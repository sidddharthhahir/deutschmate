"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArticleWord } from "@/components/Article";

/**
 * Count a number up on mount.
 *
 * The only celebratory motion in the app, and it earns its place here: the
 * recap is the screen that decides whether you come back tomorrow. Kept short
 * (700ms), eased out so it settles rather than stops, and skipped entirely
 * under prefers-reduced-motion.
 */
function useCountUp(target: number | null, ms = 700) {
  const [n, setN] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (target === null || target === 0) return;

    // Reduced motion runs the same code path with a zero duration, so the
    // first frame lands on the final value. Keeps every setState inside the
    // rAF callback rather than firing one synchronously in the effect body.
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
    const start = performance.now();

    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      setN(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, ms]);

  return n;
}

export type Recap = {
  attempts: number;
  correct: number;
  accuracy: number | null;
  reviews: number;
  newWords: number;
  remainingDue: number;
  lastMistakeTags: string[];
};

/**
 * Tagesabschluss — the only warm screen in the app.
 *
 * No nav, no progress rail, no way back into the session. It marks an ending,
 * so it gets its own ground colour and nothing to click except "done".
 *
 * Every number here is a count of something that happened (principle 4):
 *   Minuten          wall clock, written to session_log.minutes
 *   Neue Wörter      attempts today where kind='new-vocab'
 *   Wiederholungen   attempts today where kind='review'
 *   Richtig %        SUM(correct) / COUNT(*) over all of today's attempts
 */
const TAG_LABEL: Record<string, string> = {
  "article-gender": "der / die / das",
  "article-akkusativ": "der vs. den",
  "verb-ending": "Verbendung",
  "verb-position-2": "Verb an Position 2",
  "verb-final": "Infinitiv am Ende",
  plural: "Plural",
  negation: "nicht vs. kein",
  pronoun: "du / Sie / ihr",
  capitalisation: "Großschreibung",
  spelling: "Rechtschreibung",
  "word-order": "Wortstellung",
  vocabulary: "Wortwahl",
};

const WEEKDAY = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

export default function SessionRecap({
  recap,
  streak,
  canDo,
  minutes,
  nextUnit,
}: {
  recap: Recap | null;
  streak: number;
  canDo: string[];
  minutes: number;
  nextUnit?: string | null;
}) {
  const mistake = recap?.lastMistakeTags?.[0];

  return (
    <main className="bg-warm-bg text-warm-fg flex min-h-screen flex-col px-6 py-12 md:px-10">
      <div className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col justify-center gap-8 md:gap-10">
        <div className="flex flex-col gap-1.5">
          <div className="font-mono text-warm-muted text-[12.5px] tracking-[0.14em] uppercase">
            {WEEKDAY[new Date().getDay()]}
            {streak > 0 && ` · Tag ${streak}`}
          </div>
          <h1 className="font-serif text-[38px] leading-[1.05] font-semibold tracking-[-0.015em] md:text-[52px]">
            Heute geschafft
          </h1>
        </div>

        {canDo.length > 0 && (
          <div className="dm-stagger flex flex-col gap-3">
            {canDo.map((c) => (
              <div key={c} className="flex items-start gap-3.5">
                <span className="text-accent mt-0.5 text-[17px]">✓</span>
                <span className="font-serif text-[19px] md:text-[21px]">{c}</span>
              </div>
            ))}
          </div>
        )}

        <div className="bg-warm-line h-px" />

        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat n={minutes} label="Minuten" />
          <Stat n={recap?.newWords ?? 0} label="Neue Wörter" />
          <Stat n={recap?.reviews ?? 0} label="Wiederholungen" />
          <Stat n={recap?.accuracy ?? null} label="Richtig" suffix="%" />
        </div>

        <div className="bg-warm-line h-px" />

        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-16">
            {mistake && (
              <Field label="Häufigster Fehler">
                {mistake === "article-akkusativ" ? (
                  <>
                    <ArticleWord article="der" /> vs. <ArticleWord article="der" />n
                  </>
                ) : (
                  (TAG_LABEL[mistake] ?? mistake)
                )}
              </Field>
            )}
            {nextUnit && <Field label="Morgen">{nextUnit}</Field>}
            {recap && recap.remainingDue > 0 && (
              <Field label="Noch fällig">
                {recap.remainingDue}{" "}
                <span className="font-mono text-warm-muted text-[14px]">morgen</span>
              </Field>
            )}
          </div>

          <Link
            href="/"
            className="bg-warm-fg text-warm-bg flex-none rounded-xl px-10 py-4 text-[17px] font-semibold transition-colors hover:bg-white"
          >
            Fertig für heute
          </Link>
        </div>
      </div>
    </main>
  );
}

function Stat({
  n,
  label,
  suffix,
}: {
  n: number | null;
  label: string;
  suffix?: string;
}) {
  const shown = useCountUp(n);
  return (
    <div className="flex flex-col gap-1">
      <span className="font-serif text-[44px] leading-none font-semibold tracking-[-0.03em] tabular-nums md:text-[60px]">
        {n === null ? "–" : shown}
        {n !== null && suffix && <span className="text-[26px] md:text-[32px]">{suffix}</span>}
      </span>
      <span className="font-mono text-warm-muted text-[11px] tracking-[0.08em] uppercase md:text-[12px]">
        {label}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-warm-muted text-[11.5px] tracking-[0.14em] uppercase">
        {label}
      </span>
      <span className="font-serif text-[20px] md:text-[22px]">{children}</span>
    </div>
  );
}
