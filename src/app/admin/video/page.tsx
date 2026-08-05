"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { modalIsOpen } from "@/lib/keys";
import { loadYouTubeApi, extractVideoId, PLAYING, type YTPlayer } from "@/lib/youtube";

type Segment = { t_start: number; t_end: number; de: string; en: string };
type Unit = { id: string; ord: number; title: string; level: string };
type Video = {
  id: string;
  youtube_id: string;
  title: string;
  level: string;
  channel: string | null;
  unit_id: string | null;
  segments: Segment[];
};

/**
 * Segment editor — the ~12 minutes of human work per unit, made bearable.
 *
 * Play the video, hit [ at the start of a sentence and ] at the end, type what
 * you hear. You transcribe it yourself: that keeps the app to embedding (which
 * is legitimate) rather than scraping captions, and typing the line is a
 * genuinely useful listening exercise in its own right.
 */
export default function VideoAdmin() {
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);

  const [videos, setVideos] = useState<Video[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  /* Starts true so the warning cannot flash on a working install during the
     first paint. The save button is the honest gate either way. */
  const [canWrite, setCanWrite] = useState(true);

  const [ytId, setYtId] = useState("");
  const [loaded, setLoaded] = useState("");
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState("");
  const [level, setLevel] = useState("A1.1");
  const [unitId, setUnitId] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);

  const [markStart, setMarkStart] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [draftEn, setDraftEn] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const deRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/video")
      .then((r) => r.json())
      .then((d) => {
        setVideos(d.videos);
        setUnits(d.units);
        setCanWrite(d.canWrite !== false);
      });
  }, []);

  const load = useCallback(async (id: string) => {
    const clean = extractVideoId(id);
    if (!clean) return;
    setLoaded(clean);
    await loadYouTubeApi();
    if (!holder.current || !window.YT) return;
    player.current?.destroy();
    player.current = new window.YT.Player(holder.current, {
      videoId: clean,
      playerVars: { rel: 0, modestbranding: 1 },
    });
  }, []);

  const now = () => player.current?.getCurrentTime() ?? 0;

  const mark = useCallback(() => {
    if (markStart === null) {
      setMarkStart(now());
      setTimeout(() => deRef.current?.focus(), 0);
    } else {
      const end = now();
      if (draft.trim() && end > markStart) {
        setSegments((s) => [...s, { t_start: markStart, t_end: end, de: draft.trim(), en: draftEn.trim() }]);
      }
      setMarkStart(null);
      setDraft("");
      setDraftEn("");
    }
  }, [markStart, draft, draftEn]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Space toggles playback; with an overlay up that would scrub a video
      // the user can't even see.
      if (modalIsOpen()) return;
      const inField = ["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement)?.tagName,
      );
      if (e.key === "Enter" && inField && markStart !== null) {
        e.preventDefault();
        mark();
      }
      if (inField) return;
      if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        mark();
      }
      if (e.key === " ") {
        e.preventDefault();
        const p = player.current;
        if (!p) return;
        // getCurrentTime() > 0 is not "is playing" — a paused video mid-way
        // still reports a positive time. Ask the player for its actual state.
        if (p.getPlayerState() === PLAYING) p.pauseVideo();
        else p.playVideo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mark, markStart]);

  async function save() {
    const res = await fetch("/api/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        youtubeId: loaded,
        title,
        level,
        channel,
        unitId: unitId || null,
        segments,
      }),
    });
    const d = await res.json();
    /* The route is off unless DEUTSCHMATE_ADMIN=1 — it writes to the shared
       curriculum, so it does not stay open by default. Say which it is, rather
       than reporting a save that did not happen. */
    if (!res.ok) {
      setSaved(d.error ?? `Nicht gespeichert (${res.status})`);
      setTimeout(() => setSaved(null), 8000);
      return;
    }
    setSaved(`Gespeichert: ${d.segments} ${d.segments === 1 ? "Satz" : "Sätze"}`);
    const fresh = await (await fetch("/api/video")).json();
    setVideos(fresh.videos);
    setTimeout(() => setSaved(null), 3000);
  }

  function edit(v: Video) {
    setYtId(v.youtube_id);
    setTitle(v.title);
    setChannel(v.channel ?? "");
    setLevel(v.level);
    setUnitId(v.unit_id ?? "");
    setSegments(v.segments);
    void load(v.youtube_id);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-4xl px-5 py-10">
        <Link href="/" className="text-sm text-neutral-600 hover:text-neutral-400">
          ← zurück
        </Link>
        <h1 className="mt-4 text-xl font-medium">Video-Segment-Editor</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Video laden · <kbd className="rounded bg-neutral-800 px-1.5">[</kbd> am Satzanfang ·
          Satz tippen · <kbd className="rounded bg-neutral-800 px-1.5">Enter</kbd> am Satzende.
          <kbd className="ml-2 rounded bg-neutral-800 px-1.5">Leertaste</kbd> = Play/Pause.
        </p>

        {/* Said before the work, not after it.
            Segmenting a video by hand is the ~12 minutes this page exists to
            make bearable. Letting someone spend that and then refusing at the
            save button — which is what happened — is the worst possible order
            to deliver the news in. The POST is still the real gate; this is
            just the surface telling the truth about it. */}
        {!canWrite && (
          <div className="mt-5 rounded-xl border border-amber-800/60 bg-amber-950/30 p-3.5">
            <p className="text-sm text-amber-200">Speichern ist aus.</p>
            <p className="mt-1 text-[13px] leading-relaxed text-amber-200/70">
              Dieser Editor schreibt in den Lehrplan, den alle hier lesen, also ist er
              standardmäßig zu. Zum Einschalten{" "}
              <code className="rounded bg-black/30 px-1.5">DEUTSCHMATE_ADMIN=1</code> in{" "}
              <code className="rounded bg-black/30 px-1.5">.env.local</code> setzen und den
              Server neu starten. Anschauen kannst du alles auch so.
            </p>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <input
            value={ytId}
            onChange={(e) => setYtId(e.target.value)}
            placeholder="YouTube-URL oder ID"
            className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-600"
          />
          <button
            onClick={() => void load(ytId)}
            className="rounded-lg bg-neutral-100 px-5 text-sm font-medium text-neutral-900"
          >
            Laden
          </button>
        </div>

        {loaded && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <div className="overflow-hidden rounded-xl bg-black">
                <div className="aspect-video">
                  <div ref={holder} className="h-full w-full" />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Titel"
                  className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
                />
                <input
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="Kanal"
                  className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
                />
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
                >
                  {["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2"].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
                >
                  <option value="">— keine Unit —</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.level} · {u.ord}. {u.title}
                    </option>
                  ))}
                </select>
              </div>

              <div
                className={`mt-3 rounded-xl border p-3 ${
                  markStart !== null ? "border-emerald-700 bg-emerald-950/20" : "border-neutral-800"
                }`}
              >
                <p className="mb-2 text-xs text-neutral-500">
                  {markStart !== null
                    ? `Aufnahme läuft ab ${markStart.toFixed(1)}s — Enter beendet`
                    : "[ drücken, um einen Satz zu beginnen"}
                </p>
                <input
                  ref={deRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Deutscher Satz…"
                  disabled={markStart === null}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm disabled:opacity-40"
                />
                <input
                  value={draftEn}
                  onChange={(e) => setDraftEn(e.target.value)}
                  placeholder="Englisch (optional)"
                  disabled={markStart === null}
                  className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm disabled:opacity-40"
                />
              </div>

              <button
                onClick={() => void save()}
                disabled={!canWrite || !title || !segments.length}
                title={canWrite ? undefined : "DEUTSCHMATE_ADMIN=1 setzen"}
                className="mt-3 w-full rounded-lg bg-neutral-100 py-2.5 text-sm font-medium text-neutral-900 disabled:bg-neutral-800 disabled:text-neutral-600"
              >
                {saved ?? (canWrite ? `Speichern (${segments.length} Sätze)` : "Speichern ist aus")}
              </button>
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-widest text-neutral-600">
                Sätze ({segments.length})
              </p>
              <div className="max-h-[520px] space-y-1 overflow-y-auto">
                {segments.map((s, i) => (
                  <div key={i} className="group flex gap-2 rounded-lg bg-neutral-900 px-3 py-2">
                    <button
                      onClick={() => {
                        player.current?.seekTo(s.t_start, true);
                        player.current?.playVideo();
                      }}
                      className="font-mono text-[10px] text-neutral-600 hover:text-neutral-300"
                    >
                      {s.t_start.toFixed(1)}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{s.de}</p>
                      {s.en && <p className="truncate text-xs text-neutral-600">{s.en}</p>}
                    </div>
                    <button
                      onClick={() => setSegments((x) => x.filter((_, n) => n !== i))}
                      className="text-neutral-700 opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {!segments.length && (
                  <p className="py-8 text-center text-sm text-neutral-700">Noch nichts markiert.</p>
                )}
              </div>
            </div>
          </div>
        )}

        <section className="mt-12">
          <h2 className="mb-3 text-xs uppercase tracking-widest text-neutral-600">
            Gespeicherte Videos ({videos.length})
          </h2>
          <div className="space-y-1.5">
            {videos.map((v) => (
              <button
                key={v.id}
                onClick={() => edit(v)}
                className="flex w-full items-center justify-between rounded-lg border border-neutral-900 px-3 py-2.5 text-left hover:bg-neutral-900"
              >
                <span>
                  <span className="text-sm">{v.title}</span>
                  <span className="ml-2 text-xs text-neutral-600">
                    {v.level} {v.channel && `· ${v.channel}`}
                  </span>
                </span>
                <span
                  className={`text-xs ${
                    v.segments.length ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  {v.segments.length || "keine"} Sätze
                </span>
              </button>
            ))}
            {!videos.length && (
              <p className="py-6 text-center text-sm text-neutral-700">
                Noch keine Videos. Oben eine YouTube-URL einfügen.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

