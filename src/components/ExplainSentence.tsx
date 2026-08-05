"use client";

import { useState } from "react";

type State = "idle" | "loading" | "done" | "unavailable";

/** "Erklär mir das" — the grammar behind one sentence, on demand. */
export default function ExplainSentence({
  sentence,
  compact,
}: {
  sentence: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<State>("idle");
  const [body, setBody] = useState("");

  async function ask() {
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch("/api/erklaeren", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentence }),
      });
      const data = (await res.json()) as { explanation?: string | null };
      if (data.explanation) {
        setBody(data.explanation);
        setState("done");
      } else {
        setState("unavailable");
      }
    } catch {
      setState("unavailable");
    }
  }

  if (state === "done") {
    return (
      <div className="border-line-sub bg-bg dm-fade mt-3 rounded-xl border p-4">
        <p className="font-mono text-muted mb-2 text-[10.5px] tracking-[0.14em] uppercase">
          Erklärung
        </p>
        <div className="text-secondary space-y-1.5 text-[13.5px] leading-relaxed">
          {body
            .split("\n")
            .filter(Boolean)
            .map((line, n) =>
              line.trimStart().startsWith("-") ? (
                <p key={n} className="flex gap-2">
                  <span className="text-muted flex-none">·</span>
                  <span>{line.replace(/^\s*-\s*/, "")}</span>
                </p>
              ) : (
                <p key={n} className="text-fg">
                  {line}
                </p>
              ),
            )}
        </div>
      </div>
    );
  }

  if (state === "unavailable") {
    return (
      <p className="text-muted mt-3 text-center text-[12px]">
        Keine Erklärung verfügbar — offline oder kein API-Schlüssel.
      </p>
    );
  }

  return (
    <button
      onClick={() => void ask()}
      disabled={state === "loading"}
      className={
        compact
          ? "font-mono text-muted hover:text-secondary mt-2 text-[11.5px] transition-colors disabled:opacity-50"
          : "border-line text-secondary hover:border-line-strong hover:text-fg mt-3 w-full rounded-xl border py-2.5 text-[13px] transition-colors disabled:opacity-50"
      }
    >
      {state === "loading" ? "Wird erklärt…" : "Erklär mir diesen Satz"}
    </button>
  );
}
