"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playAudio } from "@/lib/speech";
import { shouldIgnoreKey } from "@/lib/keys";
import { send } from "@/lib/outbox";
import Noun, { ArticleWord } from "@/components/Article";
import type { BlockProps } from "./shared";

type DueCard = {
  cardId: number;
  wordId: string;
  lemma: string;
  article: string | null;
  plural: string | null;
  pos: string;
  en: string;
  audio_url: string | null;
  forms_json: string | null;
  /** What each grade would schedule, keyed 1–4. Computed server-side. */
  intervals?: Record<number, string>;
};

type Payload = {
  cards: DueCard[];
  capped: boolean;
  backlog: number;
  gap?: number;
  /**
   * Audio first: hear the word, answer, then see it.
   *
   * Listening is the skill that lags for almost every learner, because reading
   * German quietly rehearses spelling rather than sound. Same cards, same
   * grading, same schedule — only the order of the senses changes. The session
   * rotates it in every third day rather than making it a setting.
   */
  audioFirst?: boolean;
};

/**
 * The review card.
 *
 * Seen ~60 times a day for six months, so rhythm beats decoration:
 *  - the hand never leaves 1–4; the mouse is never required
 *  - "Gut" is the only filled button and the widest — it's the common answer,
 *    so it's findable without reading
 *  - grade is carried by position, size, fill and the printed number key.
 *    Colour is deliberately NOT one of the carriers.
 *  - Z undoes the last grade for 5 s, because a mis-hit at speed is inevitable
 */
const GRADES = [
  { g: 1, label: "Nochmal", hint: "keine Ahnung", grow: "0.86fr" },
  { g: 2, label: "Schwer", hint: "langsam", grow: "0.94fr" },
  { g: 3, label: "Gut", hint: "gewusst", grow: "1.16fr", primary: true },
  { g: 4, label: "Einfach", hint: "sofort", grow: "1.04fr" },
];

const UNDO_MS = 5000;

export default function ReviewBlock({ payload, onDone }: BlockProps<Payload>) {
  const [queue, setQueue] = useState<DueCard[]>(payload.cards);
  const [revealed, setRevealed] = useState(false);
  // Audio-first escape hatch. If the audio doesn't play — no recording, muted
  // tab, a browser with no German voice — the card must still be answerable.
  // Nothing in the session is allowed to become a wall (spec §17).
  const [peeked, setPeeked] = useState(false);
  const [undo, setUndo] = useState<{ card: DueCard } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The grade waiting out its undo window.
   *
   * "Z zurücknehmen (5 s)" used to undo nothing that mattered. The grade was
   * POSTed the instant the button was pressed, so FSRS had already moved the
   * card and logged the attempt; taking it back only put the card at the front
   * of the local queue, and answering it again graded it a SECOND time — two
   * attempt rows, two steps of the curve, from one card.
   *
   * So the send waits instead. Nothing is sent until the window closes, which
   * is the only reading of "zurücknehmen" that is true.
   */
  const held = useRef<{ cardId: number; grade: number } | null>(null);

  const commit = useCallback(() => {
    const g = held.current;
    held.current = null;
    // Through the outbox: a grade given on a train is queued, not lost.
    if (g) void send("/api/review", { cardId: g.cardId, grade: g.grade });
  }, []);

  const audioFirst = Boolean(payload.audioFirst);

  const total = payload.cards.length;
  const done = total - queue.length;
  const card = queue[0];

  // Minutes left, from cards remaining. This is the number people actually
  // want ("how much longer"), which a segment rail alone never answers.
  const minutesLeft = Math.max(1, Math.round((queue.length * 9) / 60));

  const play = useCallback(() => {
    if (card) playAudio(card.audio_url, card.lemma);
  }, [card]);

  useEffect(() => {
    play();
  }, [play]);

  /**
   * The last card had no undo window.
   *
   * Grading it emptied the queue, the effect below fired `onDone()` in the same
   * tick, the block unmounted and the grade committed — so "Z zurücknehmen
   * (5 s)", printed in the footer of every review, was true for every card
   * except the one people most often fumble: the last one, when you are already
   * reaching for whatever comes next.
   *
   * Delaying `onDone()` by five seconds would have fixed it by putting a dead
   * pause at the end of every review block, which is a worse app. So the block
   * ends on a card instead of on nothing: what you just graded, still takeable
   * back, with Weiter under it. Press it and you leave immediately; ignore it
   * and the window closes on its own and the session moves on.
   *
   * Derived, not stored. Setting it in an effect would be a setState cascade,
   * and `undo` is already the exact state that means "a grade is still
   * reversible" — when the timer clears it, this flips false and the effect
   * advances.
   */
  const closing = queue.length === 0 && undo !== null;

  useEffect(() => {
    if (queue.length === 0 && !closing) onDone();
  }, [queue.length, closing, onDone]);

  const grade = useCallback(
    (g: number) => {
      if (!card) return;
      // Answering the next card closes the previous one's window. Without this
      // the timer below would be cleared and that grade would never be sent.
      commit();

      setQueue((q) => q.slice(1));
      setRevealed(false);
      setPeeked(false);
      setUndo({ card });
      held.current = { cardId: card.cardId, grade: g };
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => {
        setUndo(null);
        commit();
      }, UNDO_MS);
    },
    [card, commit],
  );

  const takeBack = useCallback(() => {
    if (!undo) return;
    held.current = null; // never sent, so there is nothing to reverse
    setQueue((q) => [undo.card, ...q]);
    setRevealed(false);
    setPeeked(false);
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, [undo]);

  /** Weiter on the closing card: send it now and go, rather than waiting. */
  const finishNow = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    commit();
    setUndo(null); // clears `closing`, and the effect above advances
  }, [commit]);

  /* Leaving the block closes the window early rather than dropping the grade.
     Still needed even with the closing card: skipping the block, or the session
     unmounting for any other reason, must not drop a held grade. */
  useEffect(() => commit, [commit]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // A window listener does not care what has focus. Without this, typing
      // in the command palette grades the card behind it.
      if (shouldIgnoreKey(e)) return;

      // The closing card takes two keys and no others — the same Z it has been
      // advertising all block, and the usual Enter/Space to move on.
      if (closing) {
        if (e.key === "z" || e.key === "Z") takeBack();
        else if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          finishNow();
        }
        return;
      }

      if (!card) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setRevealed(true);
      } else if (e.key === "r" || e.key === "R") {
        play();
      } else if ((e.key === "z" || e.key === "Z") && undo) {
        takeBack();
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        grade(Number(e.key));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, revealed, grade, play, undo, takeBack, closing, finishNow]);

  if (closing && undo) {
    const c = undo.card;
    const noun = c.pos === "noun";
    return (
      <main className="bg-bg flex min-h-screen flex-col">
        <div className="flex flex-none flex-col gap-3.5 px-6 pt-6 md:px-10">
          <div className="flex items-center gap-4 md:gap-8">
            <span className="font-mono text-muted hidden w-[160px] text-[12.5px] md:block">
              Esc&nbsp;&nbsp;Beenden
            </span>
            <div className="flex flex-1 gap-1">
              <span className="bg-line h-1 flex-1 overflow-hidden rounded-[2px]">
                <span className="bg-fg block h-1" style={{ width: "100%" }} />
              </span>
            </div>
            <span className="font-mono text-secondary w-[110px] text-right text-[12.5px] md:w-[160px]">
              fertig
            </span>
          </div>
          <div className="font-mono text-muted text-center text-[12.5px]">
            {total} von {total} bewertet
          </div>
        </div>

        <div className="dm-rise flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <p className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase">
            zuletzt bewertet
          </p>
          <p className="font-serif break-de text-[40px] leading-tight font-semibold md:text-[52px]">
            <Noun article={noun ? c.article : null}>{c.lemma}</Noun>
          </p>
          <p className="text-secondary text-[19px]">{c.en}</p>

          <div className="mt-6 flex w-full max-w-[420px] flex-col gap-2.5">
            <button
              onClick={finishNow}
              className="bg-fg w-full rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
            >
              Weiter
            </button>
            <button
              onClick={takeBack}
              className="border-line text-secondary hover:border-line-strong hover:text-fg w-full rounded-xl border py-3 text-[14px] transition-colors"
            >
              Z&nbsp;&nbsp;zurücknehmen
            </button>
          </div>

          <p className="text-muted max-w-[44ch] text-[12.5px] leading-relaxed">
            Die Bewertung ist noch nicht abgeschickt. Sie geht raus, sobald du weitergehst.
          </p>
        </div>
      </main>
    );
  }

  if (!card) return null;

  const forms = card.forms_json
    ? (JSON.parse(card.forms_json) as Record<string, string>)
    : null;
  const isNoun = card.pos === "noun" && card.article;
  const hidden = audioFirst && !revealed && !peeked;

  return (
    <div className="flex min-h-[calc(100vh-68px)] flex-col">
      {/* ------------------------------------------------------------ head */}
      <div className="flex flex-none flex-col gap-3.5 px-6 pt-6 md:px-10">
        <div className="flex items-center gap-4 md:gap-8">
          <span className="font-mono text-muted hidden w-[160px] text-[12.5px] md:block">
            Esc&nbsp;&nbsp;Beenden
          </span>
          <div className="flex flex-1 gap-1">
            <span className="bg-line h-1 flex-1 overflow-hidden rounded-[2px]">
              <span
                className="bg-fg block h-1 transition-[width] duration-300"
                style={{ width: `${total ? (done / total) * 100 : 0}%` }}
              />
            </span>
          </div>
          <span className="font-mono text-secondary w-[110px] text-right text-[12.5px] md:w-[160px]">
            ≈ {minutesLeft} min übrig
          </span>
        </div>
        {/* `gap` arrives on the payload of a Wiedereinstieg — the recovery
            session built after three days away, capped at 20 cards. The whole
            mode was invisible: this line hardcoded "Aufwärmen", the block's
            own title never rendered, and you came back from a week off to a
            screen indistinguishable from a normal day, being let off lightly
            with no explanation of why. */}
        <div className="font-mono text-muted text-center text-[12.5px]">
          {payload.gap ? "Wiedereinstieg" : audioFirst ? "Nur Hören" : "Aufwärmen"} · Karte{" "}
          {done + 1} von {total}
          {payload.capped && ` · ${payload.backlog} fällig, Rest morgen`}
        </div>
        {payload.gap ? (
          <p className="text-secondary mx-auto max-w-[52ch] text-center text-[13.5px] leading-relaxed">
            {payload.gap} Tage Pause, {payload.backlog} Karten fällig. Heute nur die
            wichtigsten {total} — der Rest kommt zurück, wenn du wieder drin bist.
          </p>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ card */}
      {/* key={cardId} remounts on every card, so the entrance replays. */}
      <div
        key={card.cardId}
        className="dm-rise flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center"
      >
        {hidden ? (
          <>
            <button
              onClick={play}
              aria-label="Wort noch einmal hören"
              className="border-line-strong text-secondary hover:border-fg hover:text-fg flex h-[104px] w-[104px] items-center justify-center rounded-full border-2 text-[30px] transition-colors md:h-[132px] md:w-[132px] md:text-[38px]"
            >
              ▶
            </button>
            <p className="font-serif text-secondary text-[22px] md:text-[26px]">Was hörst du?</p>
          </>
        ) : (
          <div
            className={`font-serif break-de leading-[1.05] font-semibold tracking-[-0.015em] ${
              revealed ? "text-[34px] md:text-[64px]" : "text-[38px] md:text-[76px]"
            }`}
          >
            <Noun article={isNoun ? card.article : null}>{card.lemma}</Noun>
          </div>
        )}

        {!revealed ? (
          <div className="mt-3 flex flex-col items-center gap-3">
            <button
              onClick={play}
              className="border-line text-secondary hover:border-line-strong hover:text-fg flex items-center gap-2.5 rounded-full border px-5 py-3 text-[15px] transition-colors"
            >
              <span className="text-[11px]">▶</span>
              <span>{hidden ? "Nochmal hören" : "Audio"}</span>
              <span className="kbd">R</span>
            </button>
            {hidden && (
              <button
                onClick={() => setPeeked(true)}
                className="font-mono text-muted hover:text-secondary text-[11.5px] transition-colors"
              >
                Kein Ton? Wort zeigen
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="font-serif text-fg dm-fade text-[24px] md:text-[30px]">
              {card.en}
            </div>
            <div className="bg-line my-1.5 h-px w-14" />
            {isNoun && card.plural && (
              <div className="font-mono text-secondary text-[13px] md:text-[14px]">
                Plural: <ArticleWord article="die" /> {card.plural}
              </div>
            )}
            {forms && (
              <div className="font-mono text-secondary grid max-w-md grid-cols-3 gap-x-6 gap-y-1 text-[13px]">
                {Object.entries(forms).map(([p, f]) => (
                  <div key={p} className="flex justify-between gap-2">
                    <span className="text-muted">{p}</span>
                    <span className="text-fg">{f}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ------------------------------------------------------------ foot */}
      <div className="safe-bottom flex flex-none flex-col items-center gap-4 px-4 pb-4 md:px-10 md:pb-10">
        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="border-line bg-raised text-fg flex w-full max-w-[760px] items-center justify-center gap-3.5 rounded-xl border py-5 text-[17px] font-medium transition-colors hover:bg-[#243330]"
          >
            Aufdecken <span className="kbd">Leertaste</span>
          </button>
        ) : (
          <div
            className="grid w-full max-w-[760px] gap-1.5 md:gap-2.5"
            style={{ gridTemplateColumns: GRADES.map((g) => g.grow).join(" ") }}
          >
            {GRADES.map((b) => (
              <button
                key={b.g}
                onClick={() => grade(b.g)}
                className={
                  b.primary
                    ? "bg-fg flex h-[76px] flex-col items-center justify-center gap-1 rounded-xl text-[#16211E] transition-colors hover:bg-white md:h-[96px] md:gap-1.5"
                    : "border-line-strong text-fg hover:bg-raised flex h-[76px] flex-col items-center justify-center gap-1 rounded-xl border border-t-[3px] transition-colors md:h-[96px] md:gap-1.5"
                }
              >
                {/* The number key is a keyboard affordance — on a touch screen
                    it is noise competing for width the label needs. */}
                <span
                  className={`font-mono hidden text-[11px] md:block ${b.primary ? "text-[#43574F]" : "text-muted"}`}
                >
                  {b.g}
                </span>
                <span
                  className={
                    b.primary
                      ? "text-[15px] font-semibold md:text-[18px]"
                      : "text-[14px] font-medium md:text-[16px]"
                  }
                >
                  {b.label}
                </span>
                <span
                  className={`font-mono hidden text-[11px] sm:block ${b.primary ? "text-[#43574F]" : "text-muted"}`}
                >
                  {b.hint}
                </span>
                {/* What this button actually costs. Turns the choice from a
                    guess into a decision — learners calibrate much faster. */}
                {card.intervals?.[b.g] && (
                  <span
                    className={`font-mono text-[10.5px] ${
                      b.primary ? "text-[#43574F]/70" : "text-muted/60"
                    }`}
                  >
                    {card.intervals[b.g]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="font-mono text-muted hidden gap-6 text-[11.5px] md:flex">
          {!revealed && <span>Leertaste&nbsp;&nbsp;aufdecken</span>}
          <span>1–4&nbsp;&nbsp;bewerten</span>
          <span>R&nbsp;&nbsp;Audio</span>
          <button
            onClick={takeBack}
            disabled={!undo}
            className={undo ? "text-secondary hover:text-fg" : "text-muted/40 cursor-default"}
          >
            Z&nbsp;&nbsp;zurücknehmen{undo ? " (5 s)" : ""}
          </button>
          <span>Esc&nbsp;&nbsp;beenden</span>
        </div>
      </div>
    </div>
  );
}
