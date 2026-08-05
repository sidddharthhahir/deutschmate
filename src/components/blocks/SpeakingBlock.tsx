"use client";

import { useEffect, useState } from "react";
import { speak, listenOnce, diffWords } from "@/lib/speech";
import { useSpeechSupported } from "@/lib/hooks";
import { Card, Eyebrow, Progress, SkipLink, record, type BlockProps } from "./shared";

type Item = { wordId: string; de: string; en: string; audio: string | null };
type Payload = { items: Item[] };

/**
 * Speaking.
 *
 * Record → transcribe → diff against the target → highlight the words the
 * recogniser misheard. Every mark is a real recognition result, never an
 * invented "87% accuracy". Word-level ASR cannot support phoneme scores, so
 * we don't pretend it can — and the screen says so explicitly.
 */
export default function SpeakingBlock({ payload, onDone, onSkip }: BlockProps<Payload>) {
  const [i, setI] = useState(0);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = useSpeechSupported();

  const items = payload.items ?? [];
  const it = items[i];

  useEffect(() => {
    if (items.length && !it) onDone();
  }, [it, items.length, onDone]);

  if (!it) return null;

  const diff = heard ? diffWords(it.de, heard) : null;
  const hits = diff?.filter((d) => d.ok).length ?? 0;

  async function listen() {
    setListening(true);
    setError(null);
    setHeard(null);
    try {
      const text = await listenOnce();
      setHeard(text);
      const d = diffWords(it.de, text);
      await record({
        kind: "speaking",
        refId: it.wordId,
        correct: d.every((x) => x.ok),
        answer: text,
        expected: it.de,
      });
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        code === "not-allowed" || code === "service-not-allowed"
          ? "Mikrofon nicht erlaubt — bitte im Browser freigeben."
          : "Nichts gehört. Nochmal versuchen?",
      );
    } finally {
      setListening(false);
    }
  }

  return (
    <div>
      <Progress done={i} total={items.length} />
      <Eyebrow>
        Sprechen · {i + 1} / {items.length}
      </Eyebrow>

      <Card>
        <p className="font-serif text-center text-[26px]">{it.de}</p>
        <p className="text-muted mt-1.5 text-center text-[14px]">{it.en}</p>

        <div className="mt-5 text-center">
          <button
            onClick={() => speak(it.de, 0.85)}
            className="border-line text-secondary hover:border-line-strong hover:text-fg inline-flex items-center gap-2.5 rounded-full border px-5 py-2.5 text-[14px] transition-colors"
          >
            <span className="text-[10px]">▶</span> vorhören
          </button>
        </div>

        {!supported ? (
          /* Named accurately. The detection accepts webkitSpeechRecognition,
             which Safari has had since 14.1, so the honest list is Chrome, Edge
             and Safari — Firefox is the one that has never shipped it. Saying
             "use Chrome" sent a Safari user to install a browser they did not
             need, and left a Firefox user thinking it was their setup. */
          <p className="text-muted mx-auto mt-8 max-w-[48ch] text-center text-[14px] leading-relaxed">
            Dieser Browser kann keine Spracherkennung — Firefox kann es bis heute nicht. In
            Chrome, Edge und Safari läuft es. Oder überspring den Block: Sprechen ist nicht
            die einzige Übung.
          </p>
        ) : (
          <div className="mt-8 flex flex-col items-center gap-3">
            <button
              onClick={() => void listen()}
              disabled={listening}
              className={`flex h-24 w-24 items-center justify-center rounded-full text-3xl transition-colors ${
                listening ? "bg-das text-[#23201A]" : "bg-fg text-[#16211E] hover:bg-white"
              }`}
            >
              🎤
            </button>
            <p className="font-mono text-muted text-[12px]">
              {listening ? "Sprich jetzt…" : "Tippen und den Satz sagen"}
            </p>
          </div>
        )}

        {error && <p className="text-accent/90 mt-5 text-center text-[14px]">{error}</p>}

        {diff && (
          <div className="border-line-sub mt-7 border-t pt-6">
            <p className="font-mono text-muted mb-3 text-center text-[11.5px] tracking-[0.14em] uppercase">
              erkannt: {hits} / {diff.length} Wörter
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {diff.map((d, n) => (
                <span
                  key={n}
                  className={`font-serif rounded px-2 py-1 text-[18px] ${
                    d.ok ? "bg-[#1F2A20] text-[#CFE3C8]" : "bg-[#2A1F26] text-[#E8C8D6]"
                  }`}
                >
                  {d.word}
                </span>
              ))}
            </div>
            <p className="text-muted mx-auto mt-4 max-w-[52ch] text-center text-[11.5px] leading-relaxed">
              Rot = die Erkennung hat dieses Wort nicht verstanden. Das ist kein
              Aussprache-Score, sondern was der Computer wirklich gehört hat.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => void listen()}
                className="border-line text-secondary hover:border-line-strong hover:text-fg flex-1 rounded-xl border py-3.5 text-[14px] transition-colors"
              >
                Nochmal
              </button>
              <button
                onClick={() => {
                  setHeard(null);
                  setError(null);
                  setI((n) => n + 1);
                }}
                className="bg-fg flex-1 rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
              >
                Weiter
              </button>
            </div>
          </div>
        )}

        {!diff && (
          <button
            onClick={() => setI((n) => n + 1)}
            className="font-mono text-muted hover:text-secondary mt-6 w-full text-center text-[11.5px] transition-colors"
          >
            Überspringen
          </button>
        )}
      </Card>

      <SkipLink onSkip={onSkip} />
    </div>
  );
}
