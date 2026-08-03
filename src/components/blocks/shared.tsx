"use client";

import type { ReactNode } from "react";

export type BlockProps<P = unknown> = {
  payload: P;
  onDone: () => void;
  onSkip?: () => void;
};

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="border-line bg-surface rounded-[14px] border p-6 md:p-8">{children}</div>
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
 * Correct/incorrect is carried by border weight and a leading mark as well as
 * colour, so the state survives greyscale and colour blindness.
 */
export function Option({
  children,
  onClick,
  state,
}: {
  children: ReactNode;
  onClick?: () => void;
  state: "idle" | "correct" | "wrong" | "dimmed";
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
          Richtig wäre: <span className="font-serif text-fg text-[16px]">{expected}</span>
        </p>
      )}
      {why && <p className="mt-2 leading-relaxed opacity-90">{why}</p>}
    </div>
  );
}

/**
 * Credit for a corpus sentence.
 *
 * Tatoeba sentences are CC-BY 2.0 FR, which requires attribution wherever the
 * work appears — not once in a README. Rendered small and out of the way, but
 * rendered.
 */
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

/** Post an attempt. Errors are tagged server-side — that's the Fix block's fuel. */
export async function record(opts: {
  kind: string;
  refId?: string;
  correct: boolean;
  answer?: string;
  expected?: string;
  explain?: boolean;
}): Promise<{ tags: string[]; explanation?: string }> {
  try {
    const res = await fetch("/api/attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    return await res.json();
  } catch {
    return { tags: [] };
  }
}
