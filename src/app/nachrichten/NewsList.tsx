"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Episode = {
  title: string;
  date: string;
  link: string;
  audio: string | null;
  seconds: number | null;
};

type State = "loading" | "ready" | "unavailable";

function when(raw: string) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long" });
}

function mmss(s: number | null) {
  if (!s) return null;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
}

export default function NewsList() {
  const [state, setState] = useState<State>("loading");
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [source, setSource] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    (async () => {
      try {
        const res = await fetch("/api/nachrichten");
        const data = await res.json();
        if (stale) return;
        if (data.ok && data.episodes?.length) {
          setEpisodes(data.episodes);
          setSource(data.source ?? "");
          setState("ready");
        } else {
          setState("unavailable");
        }
      } catch {
        if (!stale) setState("unavailable");
      }
    })();
    return () => {
      stale = true;
    };
  }, []);

  if (state === "loading") {
    return <p className="text-muted font-mono text-sm">Lade…</p>;
  }

  if (state === "unavailable") {
    return (
      <div className="border-line rounded-[14px] border p-6">
        <p className="font-serif text-[19px]">Nachrichten nicht erreichbar</p>
        <p className="text-secondary mt-2 max-w-[54ch] text-[14px] leading-relaxed">
          Die Sendungen kommen direkt von der Deutschen Welle — ohne Verbindung gibt es
          hier nichts zu zeigen, und alte Meldungen als „heute“ auszugeben wäre falsch.
        </p>
      </div>
    );
  }

  const [today, ...rest] = episodes;

  return (
    <div>
      {/* Today's, given the room it deserves. */}
      <div className="border-line bg-surface rounded-[14px] border p-6 md:p-7">
        <p className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase">
          {when(today.date)}
          {mmss(today.seconds) && ` · ${mmss(today.seconds)}`}
        </p>
        <h2 className="font-serif mt-2 text-[24px] leading-snug font-semibold">
          {today.title}
        </h2>

        {today.audio && (
          <audio
            controls
            preload="none"
            src={today.audio}
            onPlay={() => setPlaying(today.audio)}
            className="mt-5 w-full"
          >
            Dein Browser kann kein Audio abspielen.
          </audio>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={today.link}
            target="_blank"
            rel="noreferrer noopener"
            className="border-line text-secondary hover:border-line-strong hover:text-fg rounded-xl border px-4 py-2.5 text-[13.5px] transition-colors"
          >
            Text bei der DW lesen ↗
          </a>
          <Link
            href="/text"
            className="border-line text-secondary hover:border-line-strong hover:text-fg rounded-xl border px-4 py-2.5 text-[13.5px] transition-colors"
          >
            Text hierher kopieren → durchgehen
          </Link>
        </div>

        <p className="text-muted mt-4 text-[12px] leading-relaxed">
          Hör es einmal ohne Text. Dann noch einmal mit. Dann kopier dir die Sätze, die du
          nicht verstanden hast, in „Dein Text“.
        </p>
      </div>

      {rest.length > 0 && (
        <section className="border-line-sub mt-8 border-t pt-6">
          <h3 className="font-mono text-muted mb-4 text-[11.5px] tracking-[0.14em] uppercase">
            Frühere Sendungen · {rest.length}
          </h3>
          <div className="space-y-1">
            {rest.map((e) => (
              <div
                key={e.link || e.audio || e.title}
                className="border-line-sub hover:bg-raised flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg px-3 py-2.5 transition-colors"
              >
                <span className="min-w-0">
                  <span className="font-mono text-muted mr-3 text-[11.5px]">
                    {when(e.date)}
                  </span>
                  <span className="text-secondary text-[14px]">{e.title}</span>
                </span>
                <span className="flex flex-none items-center gap-3">
                  {mmss(e.seconds) && (
                    <span className="font-mono text-muted/60 text-[11px]">
                      {mmss(e.seconds)}
                    </span>
                  )}
                  {e.audio && (
                    <button
                      onClick={() => setPlaying(playing === e.audio ? null : e.audio)}
                      className="font-mono text-accent text-[11.5px] hover:underline"
                    >
                      {playing === e.audio ? "schließen" : "▶ hören"}
                    </button>
                  )}
                </span>
                {playing === e.audio && e.audio && (
                  <audio controls autoPlay preload="none" src={e.audio} className="w-full" />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-muted/70 mt-8 text-[11.5px] leading-relaxed">
        {source}. Audio und Texte gehören der Deutschen Welle und werden direkt von dort
        geladen — DeutschMate speichert und verbreitet nichts davon.
      </p>
    </div>
  );
}
