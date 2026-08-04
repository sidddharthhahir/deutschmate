"use client";

import { useCallback, useEffect, useState } from "react";
import { useOnline } from "@/lib/hooks";
import { flush } from "@/lib/outbox";

type Correction = { original: string; corrected: string; why: string; tag: string };
type Resolved = { id: number; written: string; corrections: Correction[]; natural: string };

/**
 * The texts written offline, and the corrections coming back.
 *
 * GET /api/writing has existed since the offline queue shipped, with the
 * comment "drain the offline queue once we're back online", and nothing in the
 * app ever called it. The banner here counted the rows and said they would be
 * checked "beim nächsten Online-Start", which was never going to happen: the
 * pile only grew.
 *
 * A correction nobody reads teaches nothing, so this shows them rather than
 * silently resolving the rows. Flushing the browser outbox first matters —
 * that is where a text written offline is still sitting.
 */
export default function PendingTexts({ initial }: { initial: number }) {
  const [pending, setPending] = useState(initial);
  const [got, setGot] = useState<Resolved[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const online = useOnline();

  /* Does the work and touches no state, so the effect below can call it
     without a synchronous setState in an effect body. */
  const load = useCallback(async () => {
    await flush(); // a text written offline is in the browser, not the server yet
    const res = await fetch("/api/writing");
    return (await res.json()) as { pending: number; resolved: Resolved[] };
  }, []);

  const apply = useCallback((data: { pending: number; resolved: Resolved[] }) => {
    setPending(data.pending);
    setGot((g) => [...g, ...(data.resolved ?? [])]);
  }, []);

  const drain = useCallback(() => {
    setBusy(true);
    setFailed(false);
    load()
      .then(apply)
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  }, [load, apply]);

  // One automatic attempt when the page is open and the network is there. The
  // route corrects at most five per call, so the button below does the rest.
  useEffect(() => {
    if (!online || initial === 0) return;
    let cancelled = false;
    load()
      .then((d) => !cancelled && apply(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [online, initial, load, apply]);

  if (!pending && !got.length) return null;

  return (
    <div className="border-line-sub bg-raised mt-4 rounded-xl border p-4">
      {pending > 0 && (
        <>
          <p className="text-accent/90 text-[14px]">
            {pending} {pending === 1 ? "Text wartet" : "Texte warten"} auf Korrektur
          </p>
          <p className="text-muted mt-1 text-[12.5px]">
            {online
              ? busy
                ? "Wird geprüft…"
                : failed
                  ? "Ging gerade nicht — nochmal versuchen."
                  : "Offline geschrieben."
              : "Offline geschrieben — kommt dran, sobald du wieder online bist."}
          </p>
          {online && !busy && (
            <button
              onClick={drain}
              className="border-line text-secondary hover:border-line-strong hover:text-fg mt-3 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors"
            >
              Jetzt korrigieren
            </button>
          )}
        </>
      )}

      {got.map((r) => (
        <div key={r.id} className="border-line-sub mt-4 border-t pt-4 first:border-0 first:pt-0">
          <p className="font-mono text-muted text-[11.5px]">
            {r.written?.slice(0, 10)} · {r.corrections.length}{" "}
            {r.corrections.length === 1 ? "Korrektur" : "Korrekturen"}
          </p>
          {r.corrections.map((c, i) => (
            <p key={i} className="font-serif mt-2 text-[15px] leading-relaxed">
              <span className="text-das line-through">{c.original}</span>{" "}
              <span className="text-accent">{c.corrected}</span>
              <span className="text-muted ml-2 text-[12.5px]">{c.why}</span>
            </p>
          ))}
          {!r.corrections.length && (
            <p className="font-serif text-accent mt-2 text-[15px]">Nichts zu korrigieren.</p>
          )}
        </div>
      ))}
    </div>
  );
}
