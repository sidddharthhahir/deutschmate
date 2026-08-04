"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { playAudio, speak } from "@/lib/speech";
import { send } from "@/lib/outbox";
import { plural } from "@/lib/plural";

type Card = {
  cardId: number;
  wordId: string;
  lemma: string;
  article: string | null;
  en: string;
  audio_url: string | null;
};

type Phase = "idle" | "playing" | "paused" | "done" | "empty";

/** Seconds of silence after the German, before the English. */
const THINK = 3;

/**
 * Unterwegs — the session you do with the screen in your pocket.
 *
 * You need an hour a day and you have a walk to the tram. This plays a word,
 * leaves a gap long enough to actually retrieve it, says the English, moves on.
 *
 * IT DOES NOT GRADE ANYTHING, and that is the whole design. Nobody can honestly
 * rate their own recall while crossing a road, and a stream of guessed grades
 * would corrupt the schedule for every card it touched. This is exposure. It is
 * logged as exposure — the counter says "gehört", never "gelernt", and the FSRS
 * due dates are untouched.
 */
export default function WalkMode({ cards }: { cards: Card[] }) {
  const [phase, setPhase] = useState<Phase>(cards.length ? "idle" : "empty");
  const [i, setI] = useState(0);
  const [showing, setShowing] = useState(false);
  const [heard, setHeard] = useState(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* Stable identities. Declared as plain consts they were rebuilt every
     render, while runCard captured whichever pair existed when its useCallback
     last ran — a classic stale closure, and the compiler refuses to compile
     around it. They only touch a ref, so [] is honest. */
  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const card = cards[i];

  /* One card: German, silence, English, next. Chained with timers rather than
     speech-end events, because SpeechSynthesis end events are unreliable on
     iOS and a dropped event would stall the whole walk.

     The step advances through a ref rather than calling itself: a useCallback
     that names itself in its own body reads its binding before initialisation,
     which is a genuine temporal-dead-zone hazard and not something to silence. */
  const step = useRef<(index: number) => void>(() => {});

  const runCard = useCallback(
    (index: number) => {
      const c = cards[index];
      if (!c) {
        setPhase("done");
        return;
      }
      setI(index);
      setShowing(false);
      playAudio(c.audio_url, c.lemma);

      after(THINK * 1000, () => {
        setShowing(true);
        // The gloss is English. This is the only call site that isn't German,
        // and it used to be read out by a German voice.
        speak(c.en, 1, "en");
      });
      after(THINK * 1000 + 2200, () => {
        setHeard((n) => n + 1);
        step.current(index + 1);
      });
    },
    [cards, after],
  );

  // Assigned in an effect, not during render — writing a ref while rendering
  // is a side effect, and React is entitled to render twice.
  useEffect(() => {
    step.current = runCard;
  }, [runCard]);

  useEffect(() => clear, [clear]);

  function start() {
    setPhase("playing");
    setHeard(0);
    runCard(0);
  }

  function pause() {
    clear();
    window.speechSynthesis?.cancel();
    setPhase("paused");
  }

  function resume() {
    setPhase("playing");
    runCard(i);
  }

  /* Log once, at the end, as exposure. Sending one request per word would
     hammer the server from a phone on mobile data for no benefit. */
  const logged = useRef(false);
  useEffect(() => {
    if (phase !== "done" || logged.current || heard === 0) return;
    logged.current = true;
    /* Through the outbox. A walk is the single most likely thing in this app
       to happen without a network — that is the point of it — and a bare fetch
       dropped the whole walk silently on exactly that day. */
    void send("/api/unterwegs", { heard });
  }, [phase, heard]);

  if (phase === "empty") {
    return (
      <div className="border-line rounded-[14px] border p-8 text-center">
        <p className="font-serif text-[20px]">Nichts zu hören.</p>
        <p className="text-muted mx-auto mt-2 max-w-[44ch] text-[14px] leading-relaxed">
          Diese Runde spielt Wörter ab, die du schon kennst. Dein Deck ist noch leer —
          mach erst eine Sitzung.
        </p>
        <Link
          href="/session"
          className="bg-fg mt-6 inline-block rounded-xl px-6 py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
        >
          Zur Sitzung
        </Link>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="border-line rounded-[14px] border p-8 text-center">
        <p className="font-serif text-[44px] leading-none font-semibold tabular-nums">
          {heard}
        </p>
        <p className="font-mono text-muted mt-2 text-[11.5px] tracking-[0.14em] uppercase">
          Wörter gehört
        </p>
        <p className="text-muted mx-auto mt-5 max-w-[46ch] text-[13px] leading-relaxed">
          Gehört, nicht wiederholt. Das zählt nicht als Wiederholung und ändert nichts an
          deinem Plan — die Karten kommen weiter, wann sie dran sind.
        </p>
        <div className="mt-7 flex flex-col gap-2.5">
          <button
            onClick={() => {
              logged.current = false;
              setI(0);
              start();
            }}
            className="bg-fg w-full rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
          >
            Noch eine Runde
          </button>
          <Link
            href="/"
            className="border-line text-secondary hover:border-line-strong hover:text-fg w-full rounded-xl border py-3 text-center text-[14px] transition-colors"
          >
            Fertig
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <div className="border-line rounded-[14px] border p-6 md:p-8">
        <p className="font-serif text-[21px]">
          {plural(cards.length, "Wort", "Wörter")}, etwa{" "}
          {plural(Math.max(1, Math.round((cards.length * (THINK + 2.2)) / 60)), "Minute", "Minuten")}
        </p>
        <p className="text-secondary mt-3 max-w-[54ch] text-[14.5px] leading-relaxed">
          Kopfhörer rein, Handy in die Tasche. Deutsch, {THINK} Sekunden Pause, dann die
          Bedeutung. Du musst nichts drücken und nichts bewerten.
        </p>
        <button
          onClick={start}
          className="bg-fg mt-7 w-full rounded-xl py-4 text-[17px] font-medium text-[#16211E] transition-colors hover:bg-white"
        >
          ▶&nbsp;&nbsp;Losgehen
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------ playing
  return (
    <div className="border-line bg-surface rounded-[14px] border p-6 text-center md:p-10">
      <p className="font-mono text-muted text-[11.5px]">
        {i + 1} von {cards.length}
      </p>

      <div className="flex min-h-[190px] flex-col items-center justify-center gap-3">
        <p className="font-serif break-de text-[38px] leading-tight font-semibold md:text-[52px]">
          {card?.article ? `${card.article} ` : ""}
          {card?.lemma}
        </p>
        <p
          className={`font-serif text-secondary text-[22px] transition-opacity duration-300 ${
            showing ? "opacity-100" : "opacity-0"
          }`}
        >
          {card?.en}
        </p>
      </div>

      <div className="bg-line mt-2 h-1 w-full overflow-hidden rounded-[2px]">
        <div
          className="bg-fg h-full transition-[width] duration-300"
          style={{ width: `${cards.length ? (i / cards.length) * 100 : 0}%` }}
        />
      </div>

      <div className="safe-bottom mt-7 flex gap-2.5">
        {phase === "playing" ? (
          <button
            onClick={pause}
            className="border-line-strong text-fg hover:bg-raised flex-1 rounded-xl border py-4 text-[16px] transition-colors"
          >
            Pause
          </button>
        ) : (
          <button
            onClick={resume}
            className="bg-fg flex-1 rounded-xl py-4 text-[16px] font-medium text-[#16211E] transition-colors hover:bg-white"
          >
            Weiter
          </button>
        )}
        <button
          onClick={() => {
            clear();
            window.speechSynthesis?.cancel();
            setPhase("done");
          }}
          className="border-line text-secondary hover:border-line-strong hover:text-fg flex-none rounded-xl border px-6 py-4 text-[14px] transition-colors"
        >
          Schluss
        </button>
      </div>
    </div>
  );
}
