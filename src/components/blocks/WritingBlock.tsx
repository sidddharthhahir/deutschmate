"use client";

import { useState } from "react";
import { useOnline } from "@/lib/hooks";
import { send } from "@/lib/outbox";
import { GermanTextarea } from "@/components/GermanInput";
import { Card, Eyebrow, SkipLink, type BlockProps } from "./shared";

type Payload = { prompt: string; hint?: string; minWords?: number };
type Correction = { original: string; corrected: string; why: string; tag: string };
type Result = { corrections: Correction[]; natural: string; encouragement: string };

/**
 * Writing, with the offline queue.
 *
 * Offline you still write — the text is stored and corrected on reconnect.
 * "Write now, grade later" is a fine experience, so this never blocks a session.
 *
 * IT DID NOT STORE ANYTHING. This was a plain fetch, so offline it rejected,
 * the catch set `queued`, and the screen said "Text gespeichert · die Korrektur
 * kommt automatisch, sobald du wieder online bist" over eighty words that had
 * just been dropped on the floor. The server's queue only ever received texts
 * submitted while the network was up — the one case where it is not needed.
 *
 * It goes through the outbox now, like every other write that must survive a
 * dead network, so the sentence on the screen is true.
 */
export default function WritingBlock({ payload, onDone, onSkip }: BlockProps<Payload>) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [queued, setQueued] = useState(false);
  const online = useOnline();

  const minWords = payload.minWords ?? 15;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  async function submit() {
    setBusy(true);
    try {
      // null means the outbox is holding it — that IS the storage the screen
      // below promises, and it replays to /api/writing on reconnect.
      const data = await send<Result & { queued?: boolean }>("/api/writing", {
        prompt: payload.prompt,
        body: text,
        queueOnly: !online,
      });
      if (!data || data.queued) setQueued(true);
      else setResult(data);
    } finally {
      setBusy(false);
    }
  }

  if (queued) {
    return (
      <Card>
        <p className="font-serif text-center text-[22px]">Text gespeichert</p>
        <p className="text-muted mx-auto mt-3 max-w-[42ch] text-center text-[14px] leading-relaxed">
          Du bist offline. Die Korrektur kommt automatisch, sobald du wieder online bist.
        </p>
        <button
          onClick={onDone}
          className="bg-fg mt-7 w-full rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
        >
          Weiter
        </button>
      </Card>
    );
  }

  if (result) {
    return (
      <div>
        <Eyebrow>Korrektur</Eyebrow>
        <Card>
          <p className="font-serif text-[19px] text-[#CFE3C8]">{result.encouragement}</p>

          {result.corrections.length > 0 && (
            <div className="mt-5 space-y-3">
              {result.corrections.map((c, n) => (
                <div key={n} className="bg-bg border-line-sub rounded-xl border p-4">
                  <p className="font-serif text-das/80 text-[16px] line-through">{c.original}</p>
                  <p className="font-serif text-fg mt-1 text-[18px]">{c.corrected}</p>
                  <p className="text-muted mt-2 text-[14px]">{c.why}</p>
                </div>
              ))}
            </div>
          )}

          <div className="border-line-sub mt-5 border-t pt-5">
            <p className="font-mono text-muted mb-2 text-[11.5px] tracking-[0.14em] uppercase">
              Natürlicher formuliert
            </p>
            <p className="font-serif text-secondary text-[18px] leading-relaxed">
              {result.natural}
            </p>
          </div>

          <button
            onClick={onDone}
            className="bg-fg mt-6 w-full rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
          >
            Weiter
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Eyebrow>Schreiben</Eyebrow>
      <Card>
        <p className="font-serif text-[20px]">{payload.prompt}</p>
        {payload.hint && <p className="text-muted mt-1.5 text-[14px]">{payload.hint}</p>}

        <div className="mt-5">
          <GermanTextarea
            value={text}
            onChange={setText}
            rows={7}
            placeholder="Schreib auf Deutsch…"
            ariaLabel="Dein Text"
            className="border-line bg-bg font-serif focus:border-line-strong placeholder:text-muted w-full resize-none rounded-xl border p-4 text-[18px] leading-relaxed outline-none"
          />
        </div>

        <div className="mt-3 flex items-center justify-between text-[12.5px]">
          <span className={`font-mono ${words >= minWords ? "text-secondary" : "text-muted"}`}>
            {words} / {minWords} Wörter
          </span>
          {!online && (
            <span className="font-mono text-accent/80 text-[11.5px]">
              offline — wird gespeichert
            </span>
          )}
        </div>

        <button
          onClick={() => void submit()}
          disabled={busy || words < minWords}
          className="bg-fg mt-4 w-full rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white disabled:bg-[#243330] disabled:text-[#5C6B65]"
        >
          {busy ? "Wird geprüft…" : online ? "Korrigieren lassen" : "Speichern"}
        </button>
      </Card>
      <SkipLink onSkip={onSkip} />
    </div>
  );
}
