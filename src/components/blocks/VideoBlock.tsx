"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadYouTubeApi, type YTPlayer } from "@/lib/youtube";
import { Card, Eyebrow, SkipLink, type BlockProps } from "./shared";

type Segment = { t_start: number; t_end: number; de: string; en: string };
type Payload = {
  id: string;
  youtubeId: string;
  title: string;
  channel: string | null;
  segments: Segment[];
};

/**
 * Video via the YouTube IFrame Player API.
 *
 * Embedding is the legitimate path and also the better one: it's what lets us
 * seek, loop a single sentence and change rate from our own code — which is
 * the entire feature. Nothing is ever downloaded or re-hosted.
 */
const SPEEDS = [0.75, 1];

export default function VideoBlock({ payload, onDone, onSkip }: BlockProps<Payload>) {
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const loopUntil = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [showEn, setShowEn] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [gloss, setGloss] = useState<{ word: string; meaning: string } | null>(null);

  // Memoised: `payload.segments ?? []` creates a new array every render, which
  // would restart the playback-tracking interval on each one.
  const segments = useMemo(() => payload.segments ?? [], [payload.segments]);

  useEffect(() => {
    let dead = false;
    void loadYouTubeApi().then(() => {
      if (dead || !holder.current || !window.YT) return;
      player.current = new window.YT.Player(holder.current, {
        videoId: payload.youtubeId,
        playerVars: { rel: 0, modestbranding: 1, cc_lang_pref: "de" },
        events: { onReady: () => setReady(true) },
      });
    });
    return () => {
      dead = true;
      player.current?.destroy();
      player.current = null;
    };
  }, [payload.youtubeId]);

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const p = player.current;
      if (!p) return;
      const t = p.getCurrentTime();
      if (loopUntil.current !== null && t >= loopUntil.current) {
        p.pauseVideo();
        loopUntil.current = null;
        return;
      }
      const n = segments.findIndex((s) => t >= s.t_start && t < s.t_end);
      setActive(n === -1 ? null : n);
    }, 250);
    return () => clearInterval(id);
  }, [ready, segments]);

  const playSegment = useCallback((s: Segment, i: number) => {
    const p = player.current;
    if (!p) return;
    setActive(i);
    loopUntil.current = s.t_end;
    p.seekTo(s.t_start, true);
    p.playVideo();
  }, []);

  async function lookup(raw: string) {
    const word = raw.replace(/[.,!?„"»«:;]/g, "");
    if (!word) return;
    try {
      const res = await fetch(`/api/word?lemma=${encodeURIComponent(word)}`);
      const d = await res.json();
      setGloss({ word, meaning: d.en ?? "—" });
    } catch {
      setGloss({ word, meaning: "—" });
    }
  }

  return (
    <div>
      <Eyebrow>Video{payload.channel ? ` · ${payload.channel}` : ""}</Eyebrow>

      <Card>
        <h2 className="font-serif mb-4 text-center text-[20px] font-medium">{payload.title}</h2>

        <div className="overflow-hidden rounded-xl bg-black">
          <div className="aspect-video">
            <div ref={holder} className="h-full w-full" />
          </div>
        </div>

        {segments.length > 0 ? (
          <>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex gap-1.5">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSpeed(s);
                      player.current?.setPlaybackRate(s);
                    }}
                    className={`font-mono rounded-full px-3 py-1 text-[11.5px] transition-colors ${
                      speed === s ? "bg-line-strong text-fg" : "text-muted hover:bg-raised"
                    }`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowEn((v) => !v)}
                className="font-mono text-muted hover:text-secondary text-[11.5px] transition-colors"
              >
                {showEn ? "Englisch aus" : "Englisch an"}
              </button>
            </div>

            <div className="mt-3 max-h-[260px] space-y-1 overflow-y-auto">
              {segments.map((s, i) => (
                <button
                  key={i}
                  onClick={() => playSegment(s, i)}
                  className={`block w-full rounded-lg px-3 py-2 text-left transition-colors ${
                    active === i ? "bg-raised" : "hover:bg-raised/60"
                  }`}
                >
                  <span className="font-mono text-muted mr-2.5 text-[10px]">
                    {fmt(s.t_start)}
                  </span>
                  <span className="font-serif text-fg text-[17px]">
                    {s.de.split(/(\s+)/).map((tok, m) =>
                      tok.trim() ? (
                        <span
                          key={m}
                          onClick={(e) => {
                            e.stopPropagation();
                            void lookup(tok);
                          }}
                          className="hover:bg-line-strong rounded px-0.5"
                        >
                          {tok}
                        </span>
                      ) : (
                        tok
                      ),
                    )}
                  </span>
                  {showEn && (
                    <span className="text-muted block pl-[38px] text-[14px]">{s.en}</span>
                  )}
                </button>
              ))}
            </div>

            <p className="font-mono text-muted mt-3 text-center text-[11.5px]">
              Zeile antippen = nur diesen Satz · Wort antippen = Bedeutung
            </p>
          </>
        ) : (
          <p className="text-muted mt-5 text-center text-[14px] leading-relaxed">
            Für dieses Video sind noch keine Sätze markiert.
            <br />
            <a href="/admin/video" className="text-secondary hover:text-accent underline">
              Im Segment-Editor markieren
            </a>
          </p>
        )}

        {gloss && (
          <div className="border-line bg-bg mt-4 flex items-center justify-between rounded-xl border px-4 py-3">
            <div>
              <span className="font-serif text-[18px]">{gloss.word}</span>
              <span className="text-secondary ml-3 text-[15px]">{gloss.meaning}</span>
            </div>
            <button onClick={() => setGloss(null)} className="text-muted hover:text-fg">
              ✕
            </button>
          </div>
        )}
      </Card>

      <button
        onClick={onDone}
        className="bg-fg mt-4 w-full rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
      >
        Weiter
      </button>
      <SkipLink onSkip={onSkip} />
    </div>
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}
