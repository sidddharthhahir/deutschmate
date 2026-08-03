"use client";

import { useState } from "react";
import { speak, listenOnce } from "@/lib/speech";
import { useSpeechSupported } from "@/lib/hooks";
import type { Pair } from "@/lib/pairs";

type Heard = { said: string; matched: "a" | "b" | null };

/**
 * One of the two words.
 *
 * Declared at module scope, not inside the drill. Defining a component during
 * render gives it a new identity every time, so React unmounts and remounts
 * the whole card on each keystroke — losing focus and any animation with it.
 */
function WordCard({
  word,
  en,
  isTarget,
  wasHeard,
  correct,
  listening,
  micAvailable,
  onSay,
}: {
  word: string;
  en: string;
  isTarget: boolean;
  wasHeard: boolean;
  correct: boolean;
  listening: boolean;
  micAvailable: boolean;
  onSay: () => void;
}) {
  return (
    <div
      className={`flex-1 rounded-[14px] border p-5 text-center transition-colors ${
        wasHeard
          ? correct
            ? "border-accent bg-[#1F2A20]"
            : "border-das bg-[#2A1F26]"
          : isTarget
            ? "border-line-strong bg-raised"
            : "border-line"
      }`}
    >
      <button
        onClick={() => speak(word, 0.85)}
        className="font-serif hover:text-accent text-[28px] font-semibold transition-colors md:text-[34px]"
      >
        {word}
      </button>
      <p className="text-muted mt-1 text-[13px]">{en}</p>

      {micAvailable && (
        <button
          onClick={onSay}
          disabled={listening}
          className="border-line text-secondary hover:border-line-strong hover:text-fg mt-4 w-full rounded-xl border py-2.5 text-[13px] transition-colors disabled:opacity-40"
        >
          {listening && isTarget ? "Hört zu…" : "🎤 Sag dieses"}
        </button>
      )}
    </div>
  );
}

/**
 * Minimal pairs.
 *
 * The check is deliberately blunt: you pick a word, say it, and the recogniser
 * reports which of the two it heard. That is a real, falsifiable signal — if
 * you aim for "schön" and the machine writes "schon", the distinction isn't
 * landing. It is not a pronunciation score, and the page says so.
 *
 * A recogniser is not a phonetician. It will sometimes be wrong, and the UI
 * treats a mismatch as information rather than a verdict.
 */
export default function PairDrill({ pairs, sound }: { pairs: Pair[]; sound: string | null }) {
  const [i, setI] = useState(0);
  const [target, setTarget] = useState<"a" | "b" | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<Heard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tally, setTally] = useState({ hit: 0, miss: 0 });

  const micAvailable = useSpeechSupported();
  const p = pairs[i];

  if (!p) return null;

  const norm = (s: string) => s.toLocaleLowerCase("de").replace(/[.,!?]/g, "").trim();

  async function say(which: "a" | "b") {
    if (listening) return;
    setTarget(which);
    setHeard(null);
    setError(null);
    setListening(true);
    try {
      const said = await listenOnce(6000);
      const n = norm(said);
      const matched: "a" | "b" | null =
        n.includes(norm(p.a)) ? "a" : n.includes(norm(p.b)) ? "b" : null;
      setHeard({ said, matched });
      if (matched === which) setTally((t) => ({ ...t, hit: t.hit + 1 }));
      else setTally((t) => ({ ...t, miss: t.miss + 1 }));

      void fetch("/api/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "speaking",
          correct: matched === which,
          answer: said,
          expected: which === "a" ? p.a : p.b,
        }),
      });
    } catch (e) {
      const why = e instanceof Error ? e.message : "";
      setError(
        why === "not-allowed"
          ? "Kein Mikrofon-Zugriff. Im Browser erlauben."
          : "Nichts gehört — nochmal?",
      );
    } finally {
      setListening(false);
    }
  }

  function next() {
    setTarget(null);
    setHeard(null);
    setError(null);
    setI((n) => (n + 1) % pairs.length);
  }

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <span className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase">
          {sound ? `Laut: ${sound}` : "Gemischt"} · {i + 1} von {pairs.length}
        </span>
        {tally.hit + tally.miss > 0 && (
          <span className="font-mono text-muted text-[11.5px] tabular-nums">
            {tally.hit} von {tally.hit + tally.miss} erkannt
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {(["a", "b"] as const).map((which) => (
          <WordCard
            key={which}
            word={which === "a" ? p.a : p.b}
            en={which === "a" ? p.aEn : p.bEn}
            isTarget={target === which}
            wasHeard={heard?.matched === which}
            correct={heard?.matched === target}
            listening={listening}
            micAvailable={micAvailable}
            onSay={() => void say(which)}
          />
        ))}
      </div>

      <p className="text-secondary mt-5 text-center text-[14px] leading-relaxed">{p.tip}</p>

      {error && <p className="text-das mt-3 text-center text-[13px]">{error}</p>}

      {heard && (
        <div
          className={`dm-fade mt-4 rounded-xl border p-4 text-center text-[14px] ${
            heard.matched === target
              ? "border-[#2F4A34] bg-[#18251B] text-[#CFE3C8]"
              : "border-[#4A2F3D] bg-[#251A20] text-[#E8C8D6]"
          }`}
        >
          {heard.matched === target ? (
            <p>Erkannt als „{target === "a" ? p.a : p.b}“ — der Unterschied kommt an.</p>
          ) : heard.matched ? (
            <p>
              Du wolltest „{target === "a" ? p.a : p.b}“, gehört wurde „
              {heard.matched === "a" ? p.a : p.b}“.
            </p>
          ) : (
            <p>Weder das eine noch das andere erkannt: „{heard.said}“.</p>
          )}
        </div>
      )}

      <div className="mt-6 flex gap-2.5">
        <button
          onClick={() => {
            speak(p.a, 0.8);
            setTimeout(() => speak(p.b, 0.8), 1100);
          }}
          className="border-line text-secondary hover:border-line-strong hover:text-fg flex-1 rounded-xl border py-3.5 text-[14px] transition-colors"
        >
          Beide anhören
        </button>
        <button
          onClick={next}
          className="bg-fg flex-1 rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
        >
          Nächstes Paar
        </button>
      </div>

      {!micAvailable && (
        <p className="text-muted mt-5 text-center text-[12.5px] leading-relaxed">
          Dein Browser kann keine Spracherkennung. Anhören und nachsprechen geht trotzdem —
          nur die Rückmeldung fehlt.
        </p>
      )}
    </div>
  );
}
