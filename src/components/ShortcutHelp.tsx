"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isTypingTarget, useModalFlag } from "@/lib/keys";

/** Press ? for the keys. */
/** Keys in German, what they do in English. */
const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Everywhere",
    keys: [
      ["Cmd / Ctrl + K", "Search — words, rules, units, conversations"],
      ["?", "This list"],
      ["Esc", "Close · leave the session"],
    ],
  },
  {
    title: "Home",
    keys: [["Enter", "Start today's session"]],
  },
  {
    title: "Reviewing · Wiederholen",
    keys: [
      ["Leertaste / Space", "Reveal the answer"],
      ["1 – 4", "Grade: again · hard · good · easy"],
      ["R", "Hear it again"],
      ["Z", "Undo that grade (5 s)"],
    ],
  },
  {
    title: "Typing German",
    keys: [
      ["Alt + a o u s", "ä ö ü ß"],
      ["Alt + Shift + a", "Ä Ö Ü"],
      ["Enter", "Check, then continue"],
    ],
  },
];

export default function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  useModalFlag(open);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // "?" is a real character — never steal it from a field someone is
      // typing German into. It stays available over the palette, though,
      // which is why this checks the field rather than shouldIgnoreKey.
      if (e.key === "?" && !isTypingTarget(e)) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="border-line bg-surface dm-rise w-full max-w-[520px] rounded-[14px] border p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-serif text-[24px] font-semibold">
            Tastatur <span className="text-muted text-[15px]">· Keyboard</span>
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="text-muted hover:text-fg font-mono text-[11.5px]"
          >
            Esc
          </button>
        </div>

        {/* The keys are only half the question. Someone pressing ? because they
            are lost wants the tour, not a shortcut list. */}
        <Link
          href="/willkommen"
          onClick={() => setOpen(false)}
          className="border-line-sub hover:border-line text-secondary hover:text-fg mb-6 flex items-center justify-between rounded-xl border px-4 py-3 text-[13.5px] transition-colors"
        >
          <span>New here? How the app works</span>
          <span className="font-mono text-muted text-[11px]">→</span>
        </Link>

        <div className="space-y-5">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="font-mono text-muted mb-2 text-[10.5px] tracking-[0.14em] uppercase">
                {g.title}
              </p>
              <div className="space-y-1.5">
                {g.keys.map(([k, what]) => (
                  <div
                    key={k}
                    className="flex items-baseline justify-between gap-4"
                  >
                    <span className="kbd text-fg flex-none">{k}</span>
                    <span className="text-secondary text-right text-[13.5px]">
                      {what}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
