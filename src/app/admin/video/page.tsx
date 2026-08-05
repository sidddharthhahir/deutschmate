"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { modalIsOpen } from "@/lib/keys";
import { extractVideoId } from "@/lib/youtube";
import { mount, sourceOf, type Playable, type Source } from "@/lib/player";
import { TAP } from "@/lib/ui";
import { plural } from "@/lib/plural";

type Segment = { t_start: number; t_end: number; de: string; en: string };
type Unit = { id: string; ord: number; title: string; level: string };
type Video = {
  id: string;
  youtube_id: string;
  src_url: string | null;
  title: string;
  level: string;
  channel: string | null;
  unit_id: string | null;
  segments: Segment[];
};

/** Segment editor — the ~12 minutes of human work per unit, made bearable. */
export default function VideoAdmin() {
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<Playable | null>(null);

  const [videos, setVideos] = useState<Video[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  /* Starts true so the warning cannot flash on a working install during the
     first paint. The save button is the honest gate either way. */
  const [canWrite, setCanWrite] = useState(true);

  const [ytId, setYtId] = useState("");
  /** What is on screen: a YouTube id or a DW mp4. Null when nothing is loaded. */
  const [loaded, setLoaded] = useState<Source | null>(null);
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState("");
  const [level, setLevel] = useState("A1.1");
  const [unitId, setUnitId] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);

  const [markStart, setMarkStart] = useState<number | null>(null);
  /** A pasted transcript, one sentence per line, consumed as you mark. */
  const [script, setScript] = useState<string[]>([]);
  const [scriptAt, setScriptAt] = useState(0);
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

  /* Takes either kind. Typing a YouTube URL into the box still works — that is
     how a video outside the DW catalogue gets added — but clicking a row in the
     queue below usually hands over a DW mp4 instead. */
  const load = useCallback((source: Source) => setLoaded(source), []);

  /* Mounting happens in an effect, not inside load(). */
  useEffect(() => {
    if (!loaded || !holder.current) return;
    let dead = false;
    void mount(holder.current, loaded, () => {}).then((p) => {
      if (dead) p?.destroy();
      else player.current = p;
    });
    return () => {
      dead = true;
      player.current?.destroy();
      player.current = null;
    };
  }, [loaded]);

  const loadTyped = useCallback(
    (raw: string) => {
      const id = extractVideoId(raw);
      if (id) return void load({ kind: "youtube", youtubeId: id });
      /* Not a YouTube URL — accept a direct media URL, which is what makes
         pasting a DW link work at all. */
      if (/^https:\/\/\S+\.(mp4|webm|m4v)(\?|$)/i.test(raw.trim())) {
        void load({ kind: "file", src: raw.trim() });
      }
    },
    [load],
  );

  const now = () => player.current?.currentTime() ?? 0;

  /* Unsegmented first, then level, then title — with `numeric` so "Folge 2"
     comes before "Folge 10" instead of after "Folge 14". A queue you work
     through in order has to be IN order. Sorting a copy, because mutating the
     state array in place is a render-order bug waiting to happen. */
  const todo = videos.filter((v) => !v.segments.length).length;
  const queue = [...videos].sort(
    (a, b) =>
      Number(a.segments.length > 0) - Number(b.segments.length > 0) ||
      a.level.localeCompare(b.level) ||
      a.title.localeCompare(b.title, "de", { numeric: true }),
  );

  /* TWO WAYS TO MARK A LINE, AND THE SECOND IS THE FAST ONE. */
  const mark = useCallback(() => {
    if (markStart === null) {
      setMarkStart(now());
      // With a script loaded the text is already in the box; focusing it would
      // swallow the ] keypress that ends the line.
      if (!script.length) setTimeout(() => deRef.current?.focus(), 0);
    } else {
      const end = now();
      const line = script.length ? (script[scriptAt] ?? "") : draft;
      if (line.trim() && end > markStart) {
        setSegments((s) => [
          ...s,
          {
            t_start: markStart,
            t_end: end,
            de: line.trim(),
            en: draftEn.trim(),
          },
        ]);
        if (script.length) setScriptAt((i) => i + 1);
      }
      setMarkStart(null);
      setDraft("");
      setDraftEn("");
    }
  }, [markStart, draft, draftEn, script, scriptAt]);

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
        // Ask the player whether it is playing; a positive currentTime only
        // means the video is somewhere in the middle, paused or not.
        if (p.playing()) p.pause();
        else p.play();
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
        youtubeId: loaded?.kind === "youtube" ? loaded.youtubeId : "",
        srcUrl: loaded?.kind === "file" ? loaded.src : null,
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
    setSaved(
      `Gespeichert: ${d.segments} ${d.segments === 1 ? "Satz" : "Sätze"}`,
    );
    const fresh = await (await fetch("/api/video")).json();
    setVideos(fresh.videos);
    setTimeout(() => setSaved(null), 3000);
  }

  function edit(v: Video) {
    const source = sourceOf(v);
    if (!source) return; // a row with neither a file nor an id is not editable
    setYtId(v.src_url ?? v.youtube_id);
    setTitle(v.title);
    setChannel(v.channel ?? "");
    setLevel(v.level);
    setUnitId(v.unit_id ?? "");
    setSegments(v.segments);
    // A transcript belongs to one episode. Carrying it into the next would
    // caption the wrong video with a straight face.
    setScript([]);
    setScriptAt(0);
    setMarkStart(null);
    void load(source);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-4xl px-5 py-10">
        <Link
          href="/"
          className={`text-sm text-neutral-600 hover:text-neutral-400 ${TAP}`}
        >
          ← zurück
        </Link>
        <h1 className="mt-4 text-xl font-medium">Video-Segment-Editor</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Video laden · <kbd className="rounded bg-neutral-800 px-1.5">[</kbd>{" "}
          am Satzanfang · Satz tippen ·{" "}
          <kbd className="rounded bg-neutral-800 px-1.5">Enter</kbd> am
          Satzende.
          <kbd className="ml-2 rounded bg-neutral-800 px-1.5">Leertaste</kbd> =
          Play/Pause.
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
              Dieser Editor schreibt in den Lehrplan, den alle hier lesen, also
              ist er standardmäßig zu. Zum Einschalten{" "}
              <code className="rounded bg-black/30 px-1.5">
                DEUTSCHMATE_ADMIN=1
              </code>{" "}
              in <code className="rounded bg-black/30 px-1.5">.env.local</code>{" "}
              setzen und den Server neu starten. Anschauen kannst du alles auch
              so.
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
            onClick={() => loadTyped(ytId)}
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

              {/* Paste the manuscript once and stop typing.
                  DW publishes one for every Nicos Weg lesson; with it loaded,
                  marking a line is two keypresses instead of a transcription. */}
              {script.length === 0 ? (
                <details className="mt-3 rounded-xl border border-neutral-800 p-3">
                  <summary className="cursor-pointer text-xs text-neutral-500">
                    Transkript einfügen — dann nur noch [ und ] drücken
                  </summary>
                  <textarea
                    rows={5}
                    placeholder={
                      "Ein Satz pro Zeile.\nAuf learngerman.dw.com steht das Manuskript zu jeder Lektion."
                    }
                    onChange={(e) => {
                      const lines = e.target.value
                        .split("\n")
                        .map((l) => l.replace(/^\s*[-–•]\s*/, "").trim())
                        .filter(Boolean);
                      if (lines.length > 1) {
                        setScript(lines);
                        setScriptAt(0);
                      }
                    }}
                    className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                  />
                </details>
              ) : (
                <div className="mt-3 rounded-xl border border-neutral-800 p-3">
                  <div className="mb-2 flex items-baseline justify-between text-xs text-neutral-500">
                    <span>
                      Transkript · Zeile {Math.min(scriptAt + 1, script.length)}{" "}
                      von {script.length}
                    </span>
                    <button
                      onClick={() => {
                        setScript([]);
                        setScriptAt(0);
                      }}
                      className="text-neutral-600 hover:text-neutral-300"
                    >
                      verwerfen
                    </button>
                  </div>
                  {scriptAt < script.length ? (
                    <>
                      <p className="text-base text-neutral-100">
                        {script[scriptAt]}
                      </p>
                      {script[scriptAt + 1] && (
                        <p className="mt-1 truncate text-xs text-neutral-600">
                          danach: {script[scriptAt + 1]}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-emerald-500">
                      Transkript durch — {segments.length} Sätze markiert.
                    </p>
                  )}
                </div>
              )}

              <div
                className={`mt-3 rounded-xl border p-3 ${
                  markStart !== null
                    ? "border-emerald-700 bg-emerald-950/20"
                    : "border-neutral-800"
                }`}
              >
                <p className="mb-2 text-xs text-neutral-500">
                  {markStart !== null
                    ? `Aufnahme läuft ab ${markStart.toFixed(1)}s — ${script.length ? "] beendet" : "Enter beendet"}`
                    : "[ drücken, um einen Satz zu beginnen"}
                </p>
                {script.length === 0 && (
                  <input
                    ref={deRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Deutscher Satz…"
                    disabled={markStart === null}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm disabled:opacity-40"
                  />
                )}
                <input
                  value={draftEn}
                  onChange={(e) => setDraftEn(e.target.value)}
                  placeholder="Englisch (optional)"
                  disabled={markStart === null}
                  className={`w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm disabled:opacity-40 ${script.length === 0 ? "mt-2" : ""}`}
                />
              </div>

              <button
                onClick={() => void save()}
                disabled={!canWrite || !title || !segments.length}
                title={canWrite ? undefined : "DEUTSCHMATE_ADMIN=1 setzen"}
                className="mt-3 w-full rounded-lg bg-neutral-100 py-2.5 text-sm font-medium text-neutral-900 disabled:bg-neutral-800 disabled:text-neutral-600"
              >
                {saved ??
                  (canWrite
                    ? `Speichern (${plural(segments.length, "Satz", "Sätze")})`
                    : "Speichern ist aus")}
              </button>
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-widest text-neutral-600">
                Sätze ({segments.length})
              </p>
              <div className="max-h-[520px] space-y-1 overflow-y-auto">
                {segments.map((s, i) => (
                  <div
                    key={i}
                    className="group flex gap-2 rounded-lg bg-neutral-900 px-3 py-2"
                  >
                    <button
                      onClick={() => {
                        player.current?.seek(s.t_start);
                        player.current?.play();
                      }}
                      className="font-mono text-[10px] text-neutral-600 hover:text-neutral-300"
                    >
                      {s.t_start.toFixed(1)}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{s.de}</p>
                      {s.en && (
                        <p className="truncate text-xs text-neutral-600">
                          {s.en}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() =>
                        setSegments((x) => x.filter((_, n) => n !== i))
                      }
                      className="text-neutral-700 opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {!segments.length && (
                  <p className="py-8 text-center text-sm text-neutral-700">
                    Noch nichts markiert.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/*
          A WORK QUEUE, NOT A LIST.
          `npm run videos` seeds twenty candidates and none of them has
          segments, because segmenting is the part a person has to do. Sorted
          alphabetically they were twenty identical-looking rows; what the
          person sitting down to do this needs is "which one is next" and "how
          many are left". Unsegmented first, and the unit each one is for.
        */}
        <section className="mt-12">
          <h2 className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-xs uppercase tracking-widest text-neutral-600">
            <span>Gespeicherte Videos ({videos.length})</span>
            {videos.length > 0 && (
              <span
                className={todo === 0 ? "text-emerald-600" : "text-amber-600"}
              >
                {todo === 0
                  ? "alle segmentiert"
                  : `${todo} noch zu segmentieren`}
              </span>
            )}
          </h2>
          <div className="space-y-1.5">
            {queue.map((v) => {
              const unit = units.find((u) => u.id === v.unit_id);
              return (
                <button
                  key={v.id}
                  onClick={() => edit(v)}
                  className="flex w-full items-center justify-between gap-4 rounded-lg border border-neutral-900 px-3 py-2.5 text-left hover:bg-neutral-900"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{v.title}</span>
                    <span className="text-xs text-neutral-600">
                      {v.level}
                      {unit
                        ? ` · Unit ${unit.ord}: ${unit.title}`
                        : " · keiner Unit zugeordnet"}
                    </span>
                  </span>
                  <span
                    className={`flex-none text-xs ${
                      v.segments.length ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {v.segments.length || "keine"} Sätze
                  </span>
                </button>
              );
            })}
            {!videos.length && (
              <p className="py-6 text-center text-sm text-neutral-700">
                Noch keine Videos.{" "}
                <code className="text-neutral-500">npm run videos</code> lädt
                die geprüfte Liste — oder oben eine YouTube-URL einfügen.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
