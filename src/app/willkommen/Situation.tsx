"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SITUATIONS } from "@/lib/situation";

/**
 * The one onboarding question, shown once at the end of the first-run tour.
 * Never a gate: picking nothing and skipping both land on the home screen.
 */
export default function Situation() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function choose(value: string | null) {
    setBusy(value ?? "skip");
    try {
      await fetch("/api/situation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation: value }),
      });
    } catch {
      // Best-effort. The home screen is where you land either way.
    }
    router.push("/");
  }

  return (
    <div className="dm-rise">
      <p className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase">
        One last thing
      </p>
      <h2 className="font-serif mt-2 text-[28px] leading-[1.15] font-semibold tracking-[-0.015em] md:text-[34px]">
        What best describes your situation?
      </h2>
      <p className="text-secondary mt-3 max-w-[48ch] text-[14.5px] leading-relaxed">
        Just to point you at the right place to start. Skip it and nothing
        changes.
      </p>

      <div className="mt-7 flex flex-col gap-2.5">
        {SITUATIONS.map((s) => (
          <button
            key={s.value}
            onClick={() => void choose(s.value)}
            disabled={busy !== null}
            className="border-line hover:border-line-strong hover:bg-raised font-serif w-full rounded-xl border px-5 py-3.5 text-left text-[16px] transition-colors disabled:opacity-50"
          >
            {busy === s.value ? "…" : s.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => void choose(null)}
        disabled={busy !== null}
        className="font-mono text-muted hover:text-secondary mt-6 text-[12.5px] transition-colors disabled:opacity-50"
      >
        {busy === "skip" ? "…" : "Skip — I'll just start"}
      </button>
    </div>
  );
}
