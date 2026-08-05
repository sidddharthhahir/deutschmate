"use client";

import { speak } from "@/lib/speech";

export type Line = { de: string; en: string };

/** A list of phrases you can hear. */
export default function Phrases({
  lines,
  slow = false,
}: {
  lines: Line[];
  slow?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {lines.map((p) => (
        <button
          key={p.de}
          onClick={() => speak(p.de, slow ? 0.8 : 1)}
          className="border-line-sub hover:border-line hover:bg-raised group flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg border px-3.5 py-2.5 text-left transition-colors"
        >
          <span className="text-muted/40 group-hover:text-accent flex-none text-[12px] transition-colors">
            ▶
          </span>
          <span className="font-serif text-fg text-[16px]">{p.de}</span>
          <span className="text-muted text-[13px]">{p.en}</span>
        </button>
      ))}
    </div>
  );
}
