"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useModalFlag } from "@/lib/keys";

type Hit = {
  kind: "wort" | "grammatik" | "unit" | "szenario" | "seite";
  label: string;
  sub: string;
  href: string;
};

/* Every fixed jump below used to carry kind: "unit", so the palette opened with
   fifteen rows each tagged "UNIT" — including "Wer lernt hier?" and the tour.
   The tag is the only thing distinguishing a row's type; fifteen wrong ones
   make it noise. */
const KIND_LABEL: Record<Hit["kind"], string> = {
  wort: "Wort",
  grammatik: "Grammatik",
  unit: "Unit",
  szenario: "Gespräch",
  seite: "Seite",
};

/** Fixed destinations, offered before you've typed anything. */
const JUMPS: Hit[] = [
  {
    kind: "seite",
    label: "Heutige Sitzung",
    sub: "die eine Taste",
    href: "/session",
  },
  {
    kind: "seite",
    label: "Nur 20 Minuten",
    sub: "kurze Sitzung",
    href: "/session?kurz=1",
  },
  {
    kind: "seite",
    label: "Dein Text",
    sub: "beliebiges Deutsch einfügen",
    href: "/text",
  },
  {
    kind: "seite",
    label: "Nachrichten",
    sub: "langsam gesprochen, täglich",
    href: "/nachrichten",
  },
  {
    kind: "seite",
    label: "Alltag",
    sub: "Bürgeramt, Arzt, Handwerker, Nebenkosten …",
    href: "/alltag",
  },
  {
    kind: "seite",
    label: "Unterwegs",
    sub: "freihändig hören",
    href: "/unterwegs",
  },
  {
    kind: "seite",
    label: "Minimalpaare",
    sub: "Aussprache",
    href: "/aussprache",
  },
  {
    kind: "seite",
    label: "Wortschatz",
    sub: "alle Wörter",
    href: "/wortschatz",
  },
  {
    kind: "seite",
    label: "Problemwörter",
    sub: "was gegen dich kämpft",
    href: "/problemwoerter",
  },
  {
    kind: "seite",
    label: "Übungstest",
    sub: "30 Fragen, 30 Minuten",
    href: "/pruefung",
  },
  {
    kind: "seite",
    label: "Diese Woche",
    sub: "Wochenrückblick",
    href: "/woche",
  },
  {
    kind: "seite",
    label: "Fortschritt",
    sub: "alle Zahlen",
    href: "/fortschritt",
  },
  {
    kind: "seite",
    label: "Der Weg",
    sub: "alle 120 Units · Meilensteine",
    href: "/weg",
  },
  {
    kind: "seite",
    label: "How does this work?",
    sub: "the tour, again",
    href: "/willkommen",
  },
  {
    kind: "seite",
    label: "Wer lernt hier? · Switch learner",
    sub: "eigenes Deck pro Person",
    href: "/wer",
  },
  {
    kind: "seite",
    label: "Einstellungen · Settings",
    sub: "dein API-Schlüssel und dein Limit",
    href: "/einstellungen",
  },
];

/** Cmd/Ctrl+K — one way into everything. */
export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);

  /* Opening and closing reset the query directly. Doing it in an effect keyed
     on `open` would be a setState cascade on every toggle, and the reset is a
     consequence of the action — not of the state having changed. */
  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setHits([]);
    setSel(0);
  }, []);

  // Tells every other global shortcut to stand down while this is up.
  useModalFlag(open);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (v) {
            setQ("");
            setHits([]);
            setSel(0);
          }
          return !v;
        });
      } else if (e.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  /* Debounced. Every state write happens inside the timeout callback, never
     synchronously in the effect body, and each sits behind the stale guard —
     a slow response for "Ent" must not repaint results for "Entwicklung". */
  useEffect(() => {
    if (!open) return;
    const term = q.trim();

    let stale = false;
    const t = setTimeout(async () => {
      if (term.length < 2) {
        if (!stale) setHits([]);
        return;
      }
      try {
        const res = await fetch(`/api/suche?q=${encodeURIComponent(term)}`);
        const data = (await res.json()) as { hits: Hit[] };
        if (stale) return;
        setHits(data.hits ?? []);
        setSel(0);
      } catch {
        if (!stale) setHits([]);
      }
    }, 130);

    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, open]);

  if (!open) return null;

  const list = q.trim().length < 2 ? JUMPS : hits;

  function go(h: Hit) {
    close();
    router.push(h.href);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh]"
      onClick={close}
    >
      <div
        className="border-line bg-surface dm-rise w-full max-w-[560px] overflow-hidden rounded-[14px] border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* The overlay unmounts when closed, so the field is fresh on every
            open and autoFocus does the job without a focus effect. */}
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((n) => Math.min(list.length - 1, n + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((n) => Math.max(0, n - 1));
            } else if (e.key === "Enter" && list[sel]) {
              e.preventDefault();
              go(list[sel]);
            }
          }}
          placeholder="Wort, Regel, Unit, Gespräch…"
          className="border-line-sub text-fg placeholder:text-muted font-serif w-full border-b bg-transparent px-5 py-4 text-[18px] outline-none"
        />

        <div className="max-h-[52vh] overflow-y-auto">
          {list.length === 0 ? (
            <p className="text-muted px-5 py-6 text-center text-[13.5px]">
              Nichts gefunden für „{q}“.
            </p>
          ) : (
            list.map((h, n) => (
              <button
                key={`${h.href}-${n}`}
                onMouseEnter={() => setSel(n)}
                onClick={() => go(h)}
                className={`flex w-full items-baseline justify-between gap-4 px-5 py-3 text-left transition-colors ${
                  n === sel ? "bg-raised" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="font-serif text-fg text-[17px]">
                    {h.label}
                  </span>
                  <span className="text-muted ml-3 text-[13px]">{h.sub}</span>
                </span>
                <span className="font-mono text-muted/60 flex-none text-[10.5px] tracking-[0.1em] uppercase">
                  {KIND_LABEL[h.kind]}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="border-line-sub font-mono text-muted flex gap-5 border-t px-5 py-2.5 text-[10.5px]">
          <span>↑↓ wählen</span>
          <span>Enter öffnen</span>
          <span>Esc schließen</span>
        </div>
      </div>
    </div>
  );
}
