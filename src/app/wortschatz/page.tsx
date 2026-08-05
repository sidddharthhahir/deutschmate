"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { playAudio } from "@/lib/speech";
import AppHeader from "@/components/AppHeader";
import { ArticleWord } from "@/components/Article";
import { getJson, arr, num } from "@/lib/api";

type Row = {
  id: string;
  lemma: string;
  article: string | null;
  plural: string | null;
  pos: string;
  en: string;
  level: string;
  topic: string | null;
  audio_url: string | null;
  example_de: string | null;
  unit_ord: number | null;
  unit_title: string | null;
  in_deck: number;
};

/**
 * Wortschatz — all 2,400 words. `seen` and `learned` are separate counts and never merged —
 * reading is recognition, not recall.
 */
export default function WortschatzPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [size, setSize] = useState(50);
  const [topics, setTopics] = useState<{ topic: string; n: number }[]>([]);
  const [topic, setTopic] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [seen, setSeen] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** Bumped by "neu laden". A no-op setState would not re-run the effect. */
  const [reload, setReload] = useState(0);

  /** Every state write sits behind the `stale` guard. */
  useEffect(() => {
    let stale = false;

    (async () => {
      const p = new URLSearchParams({
        size: String(size),
        offset: String(offset),
      });
      if (topic) p.set("topic", topic);
      if (q.trim()) p.set("q", q.trim());

      // Shape-guarded, not trusted: a 401 body parses cleanly with every field
      // undefined, and `topics.map` on undefined took the whole page down.
      const data = await getJson(`/api/wortschatz?${p}`);
      if (stale) return;
      setRows(arr<Row>(data?.words));
      setTotal(num(data?.total));
      setTopics(arr<{ topic: string; n: number }>(data?.topics));
      setSeen(num(data?.seen));
      setFailed(data === null);
      setLoading(false);
    })();

    return () => {
      stale = true;
    };
  }, [size, offset, topic, q, reload]);

  async function markSeen() {
    // The ids, not the count: the server deduplicates, so paging back and
    // forward over the same words no longer inflates "gesehen".
    const res = await fetch("/api/wortschatz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seen", wordIds: rows.map((r) => r.id) }),
    });
    try {
      const d = (await res.json()) as { seen?: number };
      if (typeof d.seen === "number") setSeen(d.seen);
    } catch {
      /* the page turn matters more than the counter */
    }
    setOffset((o) => o + size);
  }

  async function addToDeck(id: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, in_deck: 1 } : r)));
    await fetch("/api/wortschatz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", wordId: id }),
    });
  }

  const page = Math.floor(offset / size) + 1;
  const pages = Math.max(1, Math.ceil(total / size));

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[880px] flex-1 px-6 py-10 md:px-10">
        <div className="mb-7 flex items-baseline justify-between">
          <h1 className="font-serif text-[32px] font-semibold tracking-[-0.015em]">
            Wortschatz
          </h1>
          {/* Not "0 gesamt" when the request failed — the deck is not empty,
              we just do not know. Principle 4 cuts both ways. */}
          <span className="font-mono text-muted text-[12.5px]">
            {failed
              ? "— gesehen · — gesamt"
              : `${seen} gesehen · ${total} gesamt`}
          </span>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => {
              setLoading(true);
              setQ(e.target.value);
              setOffset(0);
            }}
            placeholder="Suchen…"
            className="border-line bg-surface focus:border-line-strong placeholder:text-muted flex-1 rounded-xl border px-4 py-2.5 text-[14px] outline-none"
          />
          <select
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setOffset(0);
            }}
            className="border-line bg-surface font-mono rounded-xl border px-3 py-2.5 text-[12.5px]"
          >
            <option value={25}>25 / Tag</option>
            <option value={50}>50 / Tag</option>
            <option value={100}>100 / Tag</option>
          </select>
        </div>

        <div className="mb-6 flex flex-wrap gap-1.5">
          <Chip
            active={topic === null}
            onClick={() => {
              setTopic(null);
              setOffset(0);
            }}
          >
            alle
          </Chip>
          {topics.map((t) => (
            <Chip
              key={t.topic}
              active={topic === t.topic}
              onClick={() => {
                setTopic(t.topic);
                setOffset(0);
              }}
            >
              {t.topic} <span className="opacity-50">{t.n}</span>
            </Chip>
          ))}
        </div>

        {loading ? (
          <p className="font-mono text-muted py-20 text-center text-sm">
            Lade…
          </p>
        ) : failed ? (
          /* "Keine Wörter gefunden" for a failed request would be a lie about
             the deck — the words are there, the server did not answer. */
          <p className="font-serif text-muted py-20 text-center text-[19px]">
            Der Server hat nicht geantwortet.
            <br />
            <button
              onClick={() => {
                setLoading(true);
                setReload((n) => n + 1);
              }}
              className="font-mono text-accent mt-3 text-[13px] hover:underline"
            >
              neu laden
            </button>
          </p>
        ) : rows.length === 0 ? (
          <p className="font-serif text-muted py-20 text-center text-[19px]">
            Keine Wörter gefunden.
          </p>
        ) : (
          <div className="border-line divide-line-sub divide-y rounded-[14px] border">
            {rows.map((w) => (
              <div key={w.id} className="flex items-start gap-3 px-4 py-3.5">
                <button
                  onClick={() => playAudio(w.audio_url, w.lemma)}
                  className="text-muted hover:text-fg mt-0.5 text-[13px] transition-colors"
                  aria-label={`${w.lemma} anhören`}
                >
                  ▶
                </button>

                <div className="min-w-0 flex-1">
                  <div className="font-serif flex flex-wrap items-baseline gap-x-2 text-[18px]">
                    {w.article && <ArticleWord article={w.article} />}
                    <Link href={`/wort/${w.id}`} className="hover:underline">
                      {w.lemma}
                    </Link>
                    {w.plural && (
                      <span className="font-mono text-muted text-[12px]">
                        , {w.plural}
                      </span>
                    )}
                    <span className="text-secondary">— {w.en}</span>
                  </div>

                  {w.example_de && (
                    <p className="font-serif text-muted mt-0.5 text-[15px]">
                      {w.example_de}
                    </p>
                  )}
                  {w.unit_ord && (
                    <p className="font-mono text-muted/60 mt-1 text-[11px]">
                      Unit {w.unit_ord} · {w.unit_title}
                    </p>
                  )}
                </div>

                {w.in_deck ? (
                  <span className="font-mono text-accent/70 mt-1 flex-none text-[11px]">
                    ✓ im Deck
                  </span>
                ) : (
                  <button
                    onClick={() => void addToDeck(w.id)}
                    className="border-line text-muted hover:border-line-strong hover:text-fg font-mono mt-0.5 flex-none rounded-lg border px-2.5 py-1 text-[11px] transition-colors"
                  >
                    + Deck
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* No pager over a failed load: "Seite 1 / 1" is a claim about a list
            that never arrived. */}
        <div
          className={`mt-6 flex items-center justify-between ${failed ? "hidden" : ""}`}
        >
          <button
            onClick={() => setOffset((o) => Math.max(0, o - size))}
            disabled={offset === 0}
            className="border-line text-secondary hover:border-line-strong font-mono rounded-xl border px-4 py-2.5 text-[12.5px] transition-colors disabled:opacity-30"
          >
            ← zurück
          </button>
          <span className="font-mono text-muted text-[12px]">
            Seite {page} / {pages}
          </span>
          <button
            onClick={() => void markSeen()}
            disabled={offset + size >= total}
            className="bg-fg rounded-xl px-5 py-2.5 text-[14px] font-medium text-[#16211E] transition-colors hover:bg-white disabled:bg-[#243330] disabled:text-[#5C6B65]"
          >
            Gelesen — weiter →
          </button>
        </div>
      </div>
    </main>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`font-mono rounded-full px-3 py-2 text-[11.5px] transition-colors ${
        active
          ? "bg-fg text-[#16211E]"
          : "border-line text-muted hover:border-line-strong hover:text-secondary border"
      }`}
    >
      {children}
    </button>
  );
}
