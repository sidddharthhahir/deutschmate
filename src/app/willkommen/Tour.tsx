"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { markTourSeen } from "@/lib/tour";

/**
 * What this app is, for someone who has never seen it.
 *
 * Six screens, each answering one question a newcomer actually has, in the
 * order they'd ask it: what is this, what happens when I press the button,
 * what do I do on a bad day, where's the German that isn't a course, can I
 * trust the numbers, how do I not lose it all.
 *
 * Not a coach-mark overlay. Those interrupt work to describe work; this is a
 * page you read once before starting and can come back to any time.
 */

type Step = {
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  aside?: React.ReactNode;
};

const STEPS: Step[] = [
  {
    eyebrow: "Was ist das",
    title: "Ein Deutschlehrer, kein Karteikartenprogramm.",
    body: (
      <>
        <p>
          DeutschMate bringt dich von A1.1 auf B1.2 — 120 Units, 1.225 Wörter, 36
          Grammatikregeln. Gedacht für eine Stunde am Tag, etwa sechs Monate.
        </p>
        <p>
          Der Unterschied zu einer Vokabel-App: die App entscheidet, was du heute machst.
          Du wählst keine Lektion, keine Schwierigkeit, kein Thema.
        </p>
      </>
    ),
    aside: (
      <div className="border-line-sub bg-raised rounded-xl border p-4">
        <p className="font-mono text-muted text-[11px] tracking-[0.14em] uppercase">
          Der ganze Bedienungsablauf
        </p>
        <p className="font-serif mt-2 text-[26px]">Enter drücken.</p>
      </div>
    ),
  },
  {
    eyebrow: "Der Tag",
    title: "Eine Taste, dann sechs bis neun Blöcke.",
    body: (
      <>
        <p>
          Auf der Startseite steht eine Taste. Dahinter läuft die heutige Sitzung ab —
          immer derselbe Rhythmus, jeden Tag anderer Inhalt.
        </p>
        <p className="text-muted text-[14px]">
          Wichtig: bis zum Schluss durchgehen. Erst der Rückblick am Ende schreibt die
          Sitzung mit. Wer vorher abbricht, hat nichts gezählt.
        </p>
      </>
    ),
    aside: (
      <div className="border-line-sub bg-raised rounded-xl border p-4">
        <p className="font-mono text-muted mb-3 text-[11px] tracking-[0.14em] uppercase">
          Ein typischer Tag
        </p>
        <div className="space-y-1.5 text-[13.5px]">
          {[
            ["Aufwärmen", "was heute fällig ist"],
            ["Fix", "deine drei häufigsten Fehler"],
            ["Lücken", "Sätze aus deinen eigenen Fehlern"],
            ["Neue Wörter", "höchstens zwölf"],
            ["Lesen / Hören", "wechselt täglich"],
            ["Sätze bauen", "selbst produzieren"],
            ["Gespräch", "Rollenspiel"],
            ["Abschluss", "kurzes Quiz, dann Rückblick"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <span className="text-fg">{k}</span>
              <span className="text-muted text-right text-[12px]">{v}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    eyebrow: "Beim Wiederholen",
    title: "Die Hand bleibt auf den Zahlen.",
    body: (
      <>
        <p>
          Karte ansehen, <span className="kbd">Leertaste</span> zum Aufdecken, dann{" "}
          <span className="kbd">1</span>–<span className="kbd">4</span>. Auf jeder Taste
          steht, was sie kostet: „Gut → 10 min“, „Einfach → 8 d“.
        </p>
        <p className="text-muted text-[14px]">
          Vertippt? <span className="kbd">Z</span> nimmt die letzte Bewertung fünf Sekunden
          lang zurück.
        </p>
      </>
    ),
    aside: (
      <div className="border-line-sub bg-raised space-y-2 rounded-xl border p-4">
        {[
          ["Leertaste", "aufdecken"],
          ["1 2 3 4", "Nochmal · Schwer · Gut · Einfach"],
          ["R", "noch einmal hören"],
          ["Z", "Bewertung zurücknehmen"],
          ["Alt + a o u s", "ä ö ü ß"],
          ["Cmd / Ctrl + K", "alles durchsuchen"],
          ["?", "diese Liste, jederzeit"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <span className="kbd flex-none">{k}</span>
            <span className="text-secondary text-right text-[12.5px]">{v}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    eyebrow: "Wenn der Tag nicht mitspielt",
    title: "Zwanzig Minuten sind besser als null.",
    body: (
      <>
        <p>
          Unter der großen Taste steht <span className="text-fg">„Nur 20 Minuten“</span>.
          Das läuft nur die Teile, die sonst verfallen — Wiederholungen, Fix, Lücken — und
          hört dann auf.
        </p>
        <p>
          Und für den Weg zur Uni gibt es <span className="text-fg">Unterwegs</span>:
          Kopfhörer rein, Handy in die Tasche. Es bewertet nichts, weil niemand beim Laufen
          ehrlich einschätzen kann, ob er ein Wort konnte.
        </p>
      </>
    ),
  },
  {
    eyebrow: "Echtes Deutsch",
    title: "Der Kurs ist nicht alles.",
    body: (
      <p>
        Vier Sachen, die nichts mit dem Lehrplan zu tun haben und dir am Dienstag wirklich
        helfen:
      </p>
    ),
    aside: (
      <div className="space-y-2.5">
        {[
          ["Dein Text", "Beliebiges Deutsch einfügen — WG-Anzeige, Brief vom Amt, E-Mail. Sagt dir, was du schon kennst, und macht Karten daraus."],
          ["Nachrichten", "Echte Nachrichten, langsam gesprochen, jeden Tag neu."],
          ["Alltag", "Bürgeramt, WG-Besichtigung, Arzt, Bank — mit den Sätzen und der Liste, was du mitbringst."],
          ["Minimalpaare", "schon / schön. Übt genau den Laut, den die Erkennung bei dir verfehlt."],
        ].map(([k, v]) => (
          <div key={k} className="border-line-sub rounded-xl border p-3.5">
            <p className="font-serif text-[17px]">{k}</p>
            <p className="text-muted mt-1 text-[12.5px] leading-relaxed">{v}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    eyebrow: "Die Zahlen",
    title: "Nichts hier ist geschätzt.",
    body: (
      <>
        <p>
          Jede Zahl in dieser App zählt etwas, das du getan hast. Kein geratenes
          Sprachniveau, keine Bestehenswahrscheinlichkeit, kein Aussprache-Score. Wenn die
          App etwas nicht weiß, schreibt sie das hin.
        </p>
        <p className="text-muted text-[14px]">
          Deshalb sind „gesehen“ und „gelernt“ getrennt: Lesen ist Wiedererkennen, nicht
          Können.
        </p>
        <p className="border-line-sub mt-4 border-t pt-4 text-[14px]">
          <span className="text-fg">Und eine Warnung:</span> dein Fortschritt liegt nur auf
          diesem Rechner und geht nie zu GitHub. Einmal pro Woche{" "}
          <code className="bg-raised text-der rounded px-1.5 py-0.5 font-mono text-[12.5px]">
            npm run backup
          </code>{" "}
          — das ist die ganze Versicherung.
        </p>
      </>
    ),
  },
];

export default function Tour({ firstRun }: { firstRun: boolean }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  // Seeing the tour at all counts as having seen it — closing the tab halfway
  // shouldn't mean being redirected here again tomorrow.
  useEffect(() => {
    markTourSeen();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") setI((n) => Math.min(STEPS.length - 1, n + 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div>
      {/* Where you are. Clickable, because a tour you can't skip around in is
          a tour people close. */}
      <div className="mb-8 flex gap-1.5">
        {STEPS.map((_, n) => (
          <button
            key={n}
            onClick={() => setI(n)}
            aria-label={`Schritt ${n + 1}`}
            className={`h-1 flex-1 rounded-[2px] transition-colors ${
              n <= i ? "bg-fg" : "bg-line"
            }`}
          />
        ))}
      </div>

      <div key={i} className="dm-rise grid gap-8 md:grid-cols-[1fr_320px] md:gap-12">
        <div>
          <p className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase">
            {step.eyebrow}
          </p>
          <h2 className="font-serif mt-2 text-[30px] leading-[1.15] font-semibold tracking-[-0.015em] md:text-[36px]">
            {step.title}
          </h2>
          <div className="text-secondary mt-5 max-w-[54ch] space-y-3.5 text-[15.5px] leading-relaxed">
            {step.body}
          </div>
        </div>

        {step.aside && <div className="md:pt-9">{step.aside}</div>}
      </div>

      <div className="border-line-sub mt-12 flex items-center justify-between gap-4 border-t pt-6">
        <button
          onClick={() => setI((n) => Math.max(0, n - 1))}
          disabled={i === 0}
          className="border-line text-secondary hover:border-line-strong hover:text-fg rounded-xl border px-5 py-3 text-[14px] transition-colors disabled:opacity-30"
        >
          Zurück
        </button>

        <span className="font-mono text-muted text-[11.5px]">
          {i + 1} / {STEPS.length}
        </span>

        {last ? (
          <Link
            href="/"
            className="bg-fg rounded-xl px-7 py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
          >
            {firstRun ? "Los geht's" : "Fertig"}
          </Link>
        ) : (
          <button
            onClick={() => setI((n) => n + 1)}
            className="bg-fg rounded-xl px-7 py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
          >
            Weiter
          </button>
        )}
      </div>

      {!last && (
        <div className="mt-5 text-center">
          <Link
            href="/"
            className="font-mono text-muted hover:text-secondary text-[11.5px] transition-colors"
          >
            Überspringen — ich fange einfach an
          </Link>
        </div>
      )}
    </div>
  );
}
