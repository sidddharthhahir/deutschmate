"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { send } from "@/lib/outbox";
import { shouldIgnoreKey, modalIsOpen } from "@/lib/keys";

/* ------------------------------------------------------------------ keys --
 *
 * The tour teaches "your hand never leaves the number row", and for a long
 * time that was true of two blocks out of fifteen. These are the bindings the
 * rest of them share, in one place, so a learner who learns them in Aufwärmen
 * finds the same keys in the quiz.
 *
 *   1–9      pick option n
 *   Enter    the primary button — Weiter, Prüfen, Übungen starten
 *   Space    the same, where it does not fight the page (never in a text field)
 *   R        play the audio again
 *
 * All of them go through shouldIgnoreKey, so nothing fires while a text field
 * has focus or an overlay is up. That is also why the typing blocks — Hören,
 * Schreiben — bind Enter on the field itself and take R only once the field is
 * disabled: a single-letter shortcut that eats a letter you were typing is
 * worse than no shortcut.
 */

/**
 * The current callback without re-binding the listener on every render.
 *
 * Written in an effect rather than during render — a ref assignment in the
 * render body is a React Compiler error, and it is safe here because the only
 * reader is a keydown handler, which cannot run before effects have flushed.
 */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** A window keydown listener that stays out of the way of typing and modals. */
function useKey(handler: (e: KeyboardEvent) => void, enabled = true) {
  const latest = useLatest(handler);
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (shouldIgnoreKey(e)) return;
      latest.current(e);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, latest]);
}

/**
 * 1–9 choose one of `count` options.
 *
 * Pass `enabled: false` once an answer is in, or a second keypress lands on the
 * next question while the verdict for this one is still on screen.
 */
export function useChoiceKeys(
  count: number,
  pick: (n: number) => void,
  enabled = true,
) {
  useKey((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > Math.min(count, 9)) return;
    e.preventDefault();
    pick(n - 1);
  }, enabled);
}

/** Enter (and optionally Space) for the one button that moves you forward. */
export function useAdvanceKey(
  go: () => void,
  enabled = true,
  { space = true } = {},
) {
  useKey((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== "Enter" && !(space && e.key === " ")) return;
    e.preventDefault(); // Space would scroll the page
    go();
  }, enabled);
}

/**
 * Ctrl/Cmd + Enter, and deliberately NOT behind the typing guard.
 *
 * Every other binding here stays out of a text field. This one has to reach
 * into it: Schreiben is a paragraph, plain Enter must stay a newline, and the
 * submit shortcut is only useful to somebody whose hands are already in the
 * field. The modifier is what keeps it unambiguous. Modals still win.
 */
export function useSubmitKey(fn: () => void, enabled = true) {
  const latest = useLatest(fn);
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (modalIsOpen() || e.key !== "Enter" || !(e.metaKey || e.ctrlKey))
        return;
      e.preventDefault();
      latest.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, latest]);
}

/** One named key, for the bindings only one block needs. */
export function useKeyPress(key: string, fn: () => void, enabled = true) {
  useKey((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.key !== key) return;
    e.preventDefault();
    fn();
  }, enabled);
}

/** R hears it again — the same key ReviewBlock has always used. */
export function useReplayKey(play: () => void, enabled = true) {
  useKey((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== "r" && e.key !== "R") return;
    e.preventDefault();
    play();
  }, enabled);
}

/**
 * A block with nothing in it, bowing out. Renders nothing and calls onDone from
 * an effect — calling it straight from a block's render sets state on the session
 * runner mid-render, which is the "Cannot update a component while rendering a
 * different component" React reports. A component rather than a hook, because
 * the blocks that need it return early and cannot add a hook at that point.
 */
export function SkipToNext({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    onDone();
  }, [onDone]);
  return null;
}

export type BlockProps<P = unknown> = {
  payload: P;
  onDone: () => void;
  onSkip?: () => void;
};

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="border-line bg-surface rounded-[14px] border p-6 md:p-8">
      {children}
    </div>
  );
}

/** Small-caps mono label — the standard section header across the app. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-muted mb-4 text-center text-[11.5px] tracking-[0.14em] uppercase">
      {children}
    </p>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-fg w-full rounded-xl py-4 font-medium text-[#16211E] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-[#243330] disabled:text-[#5C6B65]"
    >
      {children}
    </button>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div className="bg-line mb-6 h-1 w-full overflow-hidden rounded-[2px]">
      <div
        className="bg-fg h-full transition-[width] duration-300"
        style={{ width: `${total ? (done / total) * 100 : 0}%` }}
      />
    </div>
  );
}

/**
 * Multiple-choice option.
 *
 * `n` is the 1-based key that picks it. Shown here rather than at each call
 * site so every list of choices in the app advertises the same thing, and
 * hidden on touch — `.kbd-hint` — where there is no key to press.
 */
export function Option({
  children,
  onClick,
  state,
  n,
}: {
  children: ReactNode;
  onClick?: () => void;
  state: "idle" | "correct" | "wrong" | "dimmed";
  n?: number;
}) {
  const cls = {
    idle: "border-line hover:bg-raised hover:border-line-strong text-fg",
    correct: "border-accent bg-[#1F2A20] text-fg border-l-[3px]",
    wrong: "border-das bg-[#2A1F26] text-secondary border-l-[3px]",
    dimmed: "border-line-sub text-muted opacity-45",
  }[state];

  return (
    <button
      onClick={onClick}
      disabled={state !== "idle"}
      className={`w-full rounded-xl border px-4 py-3.5 text-left text-[15px] transition-colors ${cls}`}
    >
      {state === "correct" && <span className="text-accent mr-2">✓</span>}
      {state === "wrong" && <span className="text-das mr-2">✕</span>}
      {/* The tick and the cross replace the number, so the row never jumps. */}
      {n !== undefined && state === "idle" && (
        <span className="kbd kbd-hint mr-2.5">{n}</span>
      )}
      {children}
    </button>
  );
}

/** Feedback after an answer. Explains WHY — never just "wrong". */
export function Verdict({
  ok,
  expected,
  why,
}: {
  ok: boolean;
  expected?: string;
  why?: string;
}) {
  return (
    <div
      className={`mt-5 rounded-xl border p-4 text-[14px] ${ok ? "dm-fade" : "dm-nudge"} ${
        ok
          ? "border-[#2F4A34] bg-[#18251B] text-[#CFE3C8]"
          : "border-[#4A2F3D] bg-[#251A20] text-[#E8C8D6]"
      }`}
    >
      <p className="font-medium">{ok ? "Richtig" : "Nicht ganz"}</p>
      {!ok && expected && (
        <p className="text-secondary mt-1.5">
          Richtig wäre:{" "}
          <span className="font-serif text-fg text-[16px]">{expected}</span>
        </p>
      )}
      {why && <p className="mt-2 leading-relaxed opacity-90">{why}</p>}
    </div>
  );
}

/** Credit for a corpus sentence. */
export function SentenceCredit({ credit }: { credit?: string | null }) {
  if (!credit || !credit.startsWith("tatoeba")) return null;
  return (
    <p className="font-mono text-muted/50 mt-3 text-center text-[10px]">
      Satz: Tatoeba · CC-BY 2.0 FR · {credit.replace("tatoeba ", "")}
    </p>
  );
}

export function SkipLink({ onSkip }: { onSkip?: () => void }) {
  if (!onSkip) return null;
  return (
    <button
      onClick={onSkip}
      className="font-mono text-muted hover:text-secondary mt-6 w-full text-center text-[11.5px] transition-colors"
    >
      Diesen Block überspringen
    </button>
  );
}

/** Post an attempt. */
export async function record(opts: {
  kind: string;
  refId?: string;
  correct: boolean;
  answer?: string;
  expected?: string;
  explain?: boolean;
}): Promise<{ tags: string[]; explanation?: string }> {
  const res = await send<{ tags: string[]; explanation?: string }>(
    "/api/attempt",
    opts,
  );
  return res ?? { tags: [] };
}
