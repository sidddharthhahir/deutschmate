"use client";

import { useState } from "react";
import { plural } from "@/lib/plural";

type Cache = { privateRows: number; sharedRows: number; patterns: number };

/**
 * What your key has paid into the cache, and how to take it back out.
 *
 * The app shares answers between accounts on purpose — that is why the second
 * person to ask about a sentence pays nothing. This section exists because a
 * learner cannot consent to something nobody told them about, and because after
 * BYO keys it is their money behind every shared row.
 *
 * Two buttons, not one, because the two deletions mean different things.
 * Removing your private explanations costs nobody anything. Withdrawing your
 * shared ones makes the app worse for the other people on this install, so it
 * says so before you press it.
 */
export default function CacheSection({ initial }: { initial: Cache }) {
  const [cache, setCache] = useState(initial);
  const [busy, setBusy] = useState<"private" | "all" | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function forget(scope: "private" | "all") {
    setBusy(scope);
    setSaid(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cache:forget", scope }),
      });
      const data = (await res.json()) as { removed?: number; cache?: Cache };
      if (data.cache) setCache(data.cache);
      const n = data.removed ?? 0;
      setSaid(n === 0 ? "Nichts zu löschen." : `${plural(n, "Eintrag", "Einträge")} gelöscht.`);
    } catch {
      setSaid("Hat nicht geklappt. Nochmal?");
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  }

  const nothing = cache.privateRows + cache.sharedRows + cache.patterns === 0;

  return (
    <section className="border-line-sub mt-12 border-t pt-6">
      <h2 className="font-mono text-muted mb-4 text-[11.5px] tracking-[0.14em] uppercase">
        Zwischenspeicher · what is cached
      </h2>

      <p className="text-secondary max-w-[58ch] text-[14px] leading-relaxed">
        Erklärungen zu Sätzen aus dem Kurs und zu Fehlern werden geteilt: Wer sie als
        Zweites braucht, bekommt sie umsonst. Erklärungen zu Texten, die du selbst
        einfügst, bleiben bei dir — die sieht sonst niemand.
      </p>

      {nothing ? (
        <p className="text-muted mt-4 text-[13px]">Du hast noch nichts gespeichert.</p>
      ) : (
        <>
          <div className="mt-5 space-y-2 text-[14px]">
            <Row n={cache.privateRows} label="nur für dich" hint="deine eigenen Texte" />
            <Row n={cache.sharedRows} label="geteilt" hint="Sätze aus dem Kurs" />
            <Row n={cache.patterns} label="Fehlererklärungen" hint="geteilt" />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {cache.privateRows > 0 && (
              <button
                type="button"
                onClick={() => void forget("private")}
                disabled={busy !== null}
                className="border-line-sub text-secondary hover:border-line hover:text-primary rounded-[3px] border px-3 py-1.5 text-[13px] transition-colors disabled:opacity-50"
              >
                {busy === "private" ? "Löscht…" : "Meine eigenen löschen"}
              </button>
            )}

            {cache.sharedRows + cache.patterns > 0 &&
              (confirming ? (
                <span className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="text-secondary">
                    Dann fehlen sie auch den anderen hier. Sicher?
                  </span>
                  <button
                    type="button"
                    onClick={() => void forget("all")}
                    disabled={busy !== null}
                    className="text-wrong hover:text-wrong/80 underline underline-offset-2 disabled:opacity-50"
                  >
                    {busy === "all" ? "Löscht…" : "Ja, alles"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="text-muted hover:text-secondary"
                  >
                    Abbrechen
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="text-muted hover:text-secondary text-[13px] underline underline-offset-2"
                >
                  Auch die geteilten zurückziehen
                </button>
              ))}
          </div>
        </>
      )}

      {said && <p className="text-muted mt-3 text-[12.5px]">{said}</p>}
    </section>
  );
}

function Row({ n, label, hint }: { n: number; label: string; hint: string }) {
  if (n === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-mono text-primary tabular-nums">{n}</span>
      <span className="text-secondary">{label}</span>
      <span className="text-muted text-[12.5px]">— {hint}</span>
    </div>
  );
}
