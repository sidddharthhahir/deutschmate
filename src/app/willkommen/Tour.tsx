"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { markTourSeen } from "@/lib/tour";
import { resetIntros } from "@/lib/block-intro";
import { TAP, TAP_BLOCK } from "@/lib/ui";

/** What this app is, for someone who has never seen it. IN ENGLISH, deliberately. */

type Step = {
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  aside?: React.ReactNode;
};

/** A German UI word with its meaning — teach it rather than translate it away. */
function De({ de, en }: { de: string; en: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="font-serif text-fg">{de}</span>
      <span className="text-muted"> ({en})</span>
    </span>
  );
}

const STEPS: Step[] = [
  {
    eyebrow: "What this is",
    title: "Learn German the way you'll actually use it in Germany.",
    body: (
      <>
        <p>
          DeutschMate takes you from A1.1 to B1.2 — 120 units, 2,400 words, 36
          grammar points. Built for about an hour a day, roughly seven months.
        </p>
        <p>
          It is a teacher, not a flashcard app. And what it teaches points at
          the conversations you cannot avoid here: the Bürgeramt, the WG
          viewing, the doctor, cancelling a contract.
        </p>
        <p>
          The difference from a vocabulary app:{" "}
          <strong className="text-fg">it decides what you do today</strong>. You
          never pick a lesson, a difficulty or a topic. That choice is the thing
          that stops people, so it was removed.
        </p>
        <p className="text-muted text-[14px]">
          The interface is in German on purpose — the words you see every day
          are words you learn for free. Anything <em>explaining</em> how the app
          works, like this, is in English.
        </p>
      </>
    ),
    aside: (
      <div className="border-line-sub bg-raised rounded-xl border p-4">
        <p className="font-mono text-muted text-[11px] tracking-[0.14em] uppercase">
          The entire interface
        </p>
        <p className="font-serif mt-2 text-[26px]">Press Enter.</p>
        <p className="text-muted mt-2 text-[13px]">
          That is the whole daily decision.
        </p>
      </div>
    ),
  },
  {
    eyebrow: "Your day",
    /* "six to nine" was a guess. */
    title: "One button, then five to ten blocks.",
    body: (
      <>
        <p>
          The home screen has one button. Behind it is today&apos;s session —
          the same rhythm every day, different content each time.
        </p>
        <p>
          <strong className="text-fg">Go all the way to the end.</strong> The
          recap screen is what saves the session. Quit before it and nothing is
          recorded: no streak, no cards scheduled.
        </p>
      </>
    ),
    aside: (
      <div className="border-line-sub bg-raised rounded-xl border p-4">
        <p className="font-mono text-muted mb-3 text-[11px] tracking-[0.14em] uppercase">
          A typical day
        </p>
        <div className="space-y-2 text-[13px]">
          {[
            ["Aufwärmen", "warm-up", "cards due today"],
            ["Fix", "fix", "your three commonest mistakes"],
            ["Lücken", "gaps", "sentences from your own errors"],
            ["Neue Wörter", "new words", "twelve at most"],
            ["Lesen / Hören", "reading / listening", "alternates daily"],
            ["Sätze bauen", "build sentences", "produce it yourself"],
            ["Gespräch", "conversation", "roleplay"],
            ["Abschluss", "wrap-up", "short quiz, then the recap"],
          ].map(([de, en, what]) => (
            <div key={de}>
              <span className="font-serif text-fg">{de}</span>
              <span className="text-muted text-[11.5px]"> · {en}</span>
              <p className="text-secondary text-[12px]">{what}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    eyebrow: "Reviewing",
    title: "Your hand never leaves the number row.",
    body: (
      <>
        <p>
          You see a word. <span className="kbd">Space</span> reveals the
          meaning, then <span className="kbd">1</span>–
          <span className="kbd">4</span> says how well you knew it. Each button
          shows what it costs you: “Gut → 10 min”, “Einfach → 8 d”.
        </p>
        <p>
          Be honest with the grades. The schedule is only as good as what you
          tell it, and nobody is watching.
        </p>
        <p className="text-muted text-[14px]">
          Mis-hit a key? <span className="kbd">Z</span> undoes the last grade
          for five seconds.
        </p>
      </>
    ),
    aside: (
      <div className="border-line-sub bg-raised space-y-2 rounded-xl border p-4">
        {[
          ["Space", "reveal the answer"],
          ["1 2 3 4", "again · hard · good · easy"],
          ["R", "hear it again"],
          ["Z", "undo that grade"],
          ["Alt + a o u s", "type ä ö ü ß"],
          ["Cmd / Ctrl + K", "search everything"],
          ["?", "this list, any time"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <span className="kbd flex-none">{k}</span>
            <span className="text-secondary text-right text-[12.5px]">{v}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    eyebrow: "Bad days",
    title: "A short session beats none.",
    body: (
      <>
        {/* Said "Twenty minutes beats zero" and told you to look for a button
            labelled "Nur 20 Minuten". Both were wrong and one of them had just
            stopped existing: the short session is up to four blocks and nearer
            28 minutes, so the button now names the rule instead of a number,
            and this had to follow it. An instruction that points at a label
            which is not there is the worst kind — it reads perfectly. */}
        <p>
          Under the big button there is{" "}
          <De de="Kürzere Sitzung heute" en="a shorter session today" />. It
          runs only the parts that decay if skipped — reviews, Fix, gaps,
          grammar — and nothing new. Use it on the day you would otherwise skip
          entirely.
        </p>
        <p>
          For the walk to uni there is <De de="Unterwegs" en="on the move" />:
          headphones in, phone in your pocket. It never grades anything, because
          nobody can honestly judge their own recall while crossing a road.
        </p>
      </>
    ),
  },
  {
    eyebrow: "Real German",
    title: "The course is not the whole app.",
    body: (
      <p>
        Four things with nothing to do with the syllabus, which are the ones
        that help on an actual Tuesday in Germany:
      </p>
    ),
    aside: (
      <div className="space-y-2.5">
        {[
          [
            "Dein Text",
            "your text",
            "Paste any German — a flat advert, a letter from the Amt, an email. It tells you what you already know and turns the sentences into cards.",
          ],
          [
            "Nachrichten",
            "news",
            "Real news read slowly, new every day, from Deutsche Welle.",
          ],
          [
            "Alltag",
            "everyday life",
            "Bürgeramt, flat viewing, doctor, bank — with the phrases that matter and the documents to bring.",
          ],
          [
            "Minimalpaare",
            "minimal pairs",
            "schon / schön. Drills the exact sound the recogniser keeps mishearing from you.",
          ],
        ].map(([de, en, what]) => (
          <div key={de} className="border-line-sub rounded-xl border p-3.5">
            <p className="font-serif text-[17px]">
              {de} <span className="text-muted text-[13px]">· {en}</span>
            </p>
            <p className="text-muted mt-1 text-[12.5px] leading-relaxed">
              {what}
            </p>
          </div>
        ))}
      </div>
    ),
  },
  {
    eyebrow: "The numbers",
    title: "Nothing here is estimated.",
    body: (
      <>
        <p>
          Every number in this app counts something you actually did. No guessed
          CEFR level, no probability of passing an exam, no pronunciation score.
          When the app does not know something, it says so instead of inventing
          a figure.
        </p>
        <p className="text-muted text-[14px]">
          That is why <De de="gesehen" en="seen" /> and{" "}
          <De de="gelernt" en="learned" /> are counted separately: reading a
          word is recognition, not knowledge.
        </p>
        <p className="border-line-sub mt-4 border-t pt-4 text-[14px]">
          <strong className="text-fg">One warning.</strong> Your progress lives
          only on this computer and never goes to GitHub. Once a week, run{" "}
          <code className="bg-raised text-der rounded px-1.5 py-0.5 font-mono text-[12.5px]">
            npm run backup
          </code>
          . That is the entire insurance policy.
        </p>
      </>
    ),
  },
];

export default function Tour({ firstRun }: { firstRun: boolean }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  // Seeing the tour at all counts as having seen it — closing the tab halfway
  // shouldn't mean being redirected here again tomorrow.
  useEffect(() => {
    markTourSeen();
    /* Coming back here on purpose is a request to be told how this works, so
       the per-block doorways come back with it. Not on the first run: those
       have never been shown, and clearing an empty list would be theatre. */
    if (!firstRun) resetIntros();
  }, [firstRun]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight")
        setI((n) => Math.min(STEPS.length - 1, n + 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div>
      {/* Where you are. Clickable, because a tour you can't skip around in is
          a tour people close. */}
      <div className="mb-8 flex gap-1.5">
        {STEPS.map((_, n) => (
          <button
            key={n}
            onClick={() => setI(n)}
            aria-label={`Step ${n + 1}`}
            // TAP_BLOCK, not TAP: these are flex-1 children, and the rail is
            // drawn 4px tall. The overlay is vertical only, so the six do not
            // overlap each other.
            className={`h-1 flex-1 rounded-[2px] transition-colors ${TAP_BLOCK} ${
              n <= i ? "bg-fg" : "bg-line"
            }`}
          />
        ))}
      </div>

      <div
        key={i}
        className="dm-rise grid gap-8 md:grid-cols-[1fr_320px] md:gap-12"
      >
        <div>
          <p className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase">
            {step.eyebrow}
          </p>
          <h2 className="font-serif mt-2 text-[30px] leading-[1.15] font-semibold tracking-[-0.015em] md:text-[36px]">
            {step.title}
          </h2>
          <div className="text-secondary mt-5 max-w-[54ch] space-y-3.5 text-[15.5px] leading-relaxed">
            {step.body}
          </div>
        </div>

        {step.aside && <div className="md:pt-9">{step.aside}</div>}
      </div>

      <div className="border-line-sub mt-12 flex items-center justify-between gap-4 border-t pt-6">
        <button
          onClick={() => setI((n) => Math.max(0, n - 1))}
          disabled={i === 0}
          className="border-line text-secondary hover:border-line-strong hover:text-fg rounded-xl border px-5 py-3 text-[14px] transition-colors disabled:opacity-30"
        >
          Back
        </button>

        <span className="font-mono text-muted text-[11.5px]">
          {i + 1} / {STEPS.length}
        </span>

        {last ? (
          <Link
            href="/"
            className="bg-fg rounded-xl px-7 py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
          >
            {/* A real apostrophe, not the HTML entity for one.
                JSX decodes entities in text and does not decode them inside a
                string literal, so this button printed the entity itself — the
                last thing anyone sees before starting, on the one screen
                written for someone who has never opened the app. The lint rule
                that asks for the entity applies only to JSX text, which is
                exactly why the habit gets carried somewhere it is wrong.
                tests/strings.test.mts scans for it now. */}
            {firstRun ? "Let’s go" : "Done"}
          </Link>
        ) : (
          <button
            onClick={() => setI((n) => n + 1)}
            className="bg-fg rounded-xl px-7 py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
          >
            Next
          </button>
        )}
      </div>

      {!last && (
        <div className="mt-5 text-center">
          <Link
            href="/"
            className={`font-mono text-muted hover:text-secondary text-[11.5px] transition-colors ${TAP}`}
          >
            Skip — I&apos;ll just start
          </Link>
        </div>
      )}
    </div>
  );
}
