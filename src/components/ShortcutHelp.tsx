"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isTypingTarget, useModalFlag } from "@/lib/keys";

/**
 * Press ? for the keys.
 *
 * The app is genuinely keyboard-driven — grading a card never needs the mouse —
 * but until now nothing listed the keys anywhere, so you had to discover them
 * from hints printed under the block you happened to be in.
 */
const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Überall",
    keys: [
      ["Cmd / Ctrl + K", "Suche — Wort, Regel, Unit, Gespräch"],
      ["?", "Diese Liste"],
      ["Esc", "Schließen · Sitzung beenden"],
    ],
  },
  {
    title: "Startseite",
    keys: [["Enter", "Sitzung starten"]],
  },
  {
    title: "Wiederholen",
    keys: [
      ["Leertaste", "Aufdecken"],
      ["1 – 4", "Bewerten: Nochmal · Schwer · Gut · Einfach"],
      ["R", "Audio noch einmal"],
      ["Z", "Letzte Bewertung zurücknehmen (5 s)"],
    ],
  },
  {
    title: "Tippen",
    keys: [
      ["Alt + a o u s", "ä ö ü ß"],
      ["Alt + Shift + a", "Ä Ö Ü"],
      ["Enter", "Prüfen, dann weiter"],
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
          <h2 className="font-serif text-[24px] font-semibold">Tastatur</h2>
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
          <span>Neu hier? Wie die App funktioniert</span>
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
                  <div key={k} className="flex items-baseline justify-between gap-4">
                    <span className="kbd text-fg flex-none">{k}</span>
                    <span className="text-secondary text-right text-[13.5px]">{what}</span>
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
