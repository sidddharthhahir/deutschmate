"use client";

import Link from "next/link";
import { useState } from "react";
import Noun from "@/components/Article";
import { playAudio } from "@/lib/speech";
import type { Leech } from "@/lib/leech";

type Action = "reset" | "pause" | "resume" | "cloze";

/** What each row is currently saying about itself. */
type Note = { text: string; tone: "ok" | "warn" } | null;

export default function LeechList({
  initial,
  threshold,
}: {
  initial: Leech[];
  threshold: number;
}) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, Note>>({});

  async function act(card: Leech, action: Action) {
    setBusy(card.cardId);
    try {
      const res = await fetch("/api/leech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.cardId, action }),
      });
      const data = (await res.json()) as { ok?: boolean };

      // The row updates from what the server actually did, not from what the
      // button was called. A cloze that couldn't be made says so.
      setNotes((n) => ({ ...n, [card.cardId]: noteFor(action, Boolean(data.ok)) }));
      if (data.ok) {
        setRows((rs) =>
          rs.map((r) =>
            r.cardId !== card.cardId
              ? r
              : action === "pause"
                ? { ...r, suspended: 1 }
                : action === "resume"
                  ? { ...r, suspended: 0 }
                  : action === "reset"
                    ? { ...r, reps: 0, suspended: 0 }
                    : r,
          ),
        );
      }
    } catch {
      setNotes((n) => ({
        ...n,
        [card.cardId]: { text: "Nicht gespeichert — offline?", tone: "warn" },
      }));
    } finally {
      setBusy(null);
    }
  }

  if (!rows.length) {
    return (
      <div className="border-line rounded-[14px] border p-8 text-center">
        <p className="font-serif text-[20px]">Keine Problemwörter.</p>
        <p className="text-muted mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed">
          Kein Wort hat dich {threshold}-mal oder öfter aus dem Konzept gebracht. Das ist
          eine gute Nachricht und keine leere Seite.
        </p>
      </div>
    );
  }

  return (
    <div className="dm-stagger space-y-2.5">
      {rows.map((r) => {
        const note = notes[r.cardId];
        const paused = r.suspended === 1;
        return (
          <div
            key={r.cardId}
            className={`border-line rounded-[14px] border p-5 transition-opacity ${
              paused ? "opacity-45" : ""
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="flex items-baseline gap-3">
                <Link
                  href={`/wort/${r.wordId}`}
                  className="font-serif hover:text-accent text-[22px] font-medium transition-colors"
                >
                  <Noun article={r.pos === "noun" ? r.article : null}>{r.lemma}</Noun>
                </Link>
                <span className="text-secondary text-[15px]">{r.en}</span>
              </div>
              <button
                onClick={() => playAudio(r.audio_url, r.lemma)}
                aria-label={`${r.lemma} anhören`}
                className="text-muted hover:text-fg font-mono text-[12px] transition-colors"
              >
                ▶ Audio
              </button>
            </div>

            {/* Counts only. No "difficulty score", no percentage dressed up as
                a grade — how often you forgot it and how often you got it. */}
            <p className="font-mono text-muted mt-2 text-[12px]">
              {r.lapses}× vergessen · {r.correct_n} von {r.seen} richtig
              {paused && " · pausiert"}
            </p>

            {r.example_de && (
              <p className="font-serif text-secondary mt-2.5 text-[16px]">
                {r.example_de}
                {r.example_en && (
                  <span className="text-muted ml-2 text-[13px]">{r.example_en}</span>
                )}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {r.example_de && (
                <Act onClick={() => void act(r, "cloze")} busy={busy === r.cardId}>
                  Im Satz üben
                </Act>
              )}
              <Act onClick={() => void act(r, "reset")} busy={busy === r.cardId}>
                Neu anfangen
              </Act>
              <Act
                onClick={() => void act(r, paused ? "resume" : "pause")}
                busy={busy === r.cardId}
              >
                {paused ? "Zurückholen" : "Pausieren"}
              </Act>
            </div>

            {note && (
              <p
                className={`dm-fade mt-3 text-[12.5px] ${
                  note.tone === "ok" ? "text-accent" : "text-das"
                }`}
              >
                {note.text}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function noteFor(action: Action, ok: boolean): Note {
  if (!ok) {
    return action === "cloze"
      ? { text: "Kein passender Beispielsatz — nichts angelegt.", tone: "warn" }
      : { text: "Ging nicht.", tone: "warn" };
  }
  switch (action) {
    case "cloze":
      return { text: "Lückensatz angelegt — kommt in der nächsten Sitzung.", tone: "ok" };
    case "reset":
      return { text: "Zurückgesetzt. Das Wort kommt wie neu zurück.", tone: "ok" };
    case "pause":
      return { text: "Pausiert. Kommt nicht mehr, bis du es zurückholst.", tone: "ok" };
    case "resume":
      return { text: "Wieder im Deck.", tone: "ok" };
  }
}

function Act({
  children,
  onClick,
  busy,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="border-line text-secondary hover:border-line-strong hover:text-fg rounded-full border px-3.5 py-1.5 text-[13px] transition-colors disabled:opacity-40"
    >
      {children}
    </button>
  );
}
