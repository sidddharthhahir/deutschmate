"use client";

import { useEffect, useRef, useState } from "react";
import { speak, listenOnce } from "@/lib/speech";
import { useSpeechSupported } from "@/lib/hooks";
import { GermanInput, UmlautBar } from "@/components/GermanInput";
import {
  Card,
  Eyebrow,
  SkipLink,
  SkipToNext,
  record,
  type BlockProps,
} from "./shared";

type Scenario = { role: string; goal: string; opener: string };
type DialogueOption = { say: string; ok: boolean; why?: string; next: number };
type DialogueStep = { them: string; options: DialogueOption[] };
type Payload = {
  scenario: Scenario;
  dialogue: DialogueStep[] | null;
  unitId: string;
  /** Set when this scene is a revisit: which unit it originally came from. */
  from?: string | null;
};

type Turn = { role: "user" | "assistant"; content: string };
type Correction = {
  original: string;
  corrected: string;
  why: string;
  tag: string;
};

/**
 * Conversation — the one block that wants the network. Corrections appear only at the end:
 * interrupting a beginner mid-sentence is how people stop speaking.
 */
export default function ConversationBlock({
  payload,
  onDone,
  onSkip,
}: BlockProps<Payload>) {
  const [mode, setMode] = useState<"probing" | "live" | "scripted">("probing");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [step, setStep] = useState(0);
  /** Whether every scripted choice so far was the right one. */
  const scriptOk = useRef(true);
  const [scriptLog, setScriptLog] = useState<
    { who: "them" | "you"; text: string; why?: string }[]
  >([]);
  const [corrections, setCorrections] = useState<Correction[] | null>(null);
  const [listening, setListening] = useState(false);
  /** Hands-free mode. */
  const [voice, setVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const micAvailable = useSpeechSupported();

  const dialogue = payload.dialogue ?? [];
  /*
   * A unit with no scenario must bow out, not crash. session.ts no longer sends
   * one, but this block reads payload.scenario.role in two places and a null
   * there took down the whole session runner — a white screen at block five,
   * before the recap that saves the session. Spec §17: never a dead end.
   */
  const noScenario = !payload.scenario?.role;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (noScenario) return; // nothing to open a conversation about
      if (!navigator.onLine) {
        setMode("scripted");
        startScript();
        return;
      }
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "say",
            unitId: payload.unitId,
            history: [],
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.offline || !data.reply) {
          setMode("scripted");
          startScript();
        } else {
          setMode("live");
          setTurns([{ role: "assistant", content: data.reply }]);
          speak(data.reply);
        }
      } catch {
        if (!cancelled) {
          setMode("scripted");
          startScript();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, scriptLog]);

  /* Placed with the other hooks, so the early return below breaks no rule. */
  if (noScenario) return <SkipToNext onDone={onDone} />;

  function startScript() {
    if (dialogue[0]) {
      setScriptLog([{ who: "them", text: dialogue[0].them }]);
      speak(dialogue[0].them);
    }
  }

  async function send(text: string) {
    if (!text.trim() || thinking) return;
    const history: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(history);
    setInput("");
    setThinking(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "say",
          unitId: payload.unitId,
          history,
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setTurns([...history, { role: "assistant", content: data.reply }]);
        speak(data.reply);
      } else {
        setMode("scripted");
        startScript();
      }
    } catch {
      setMode("scripted");
      startScript();
    } finally {
      setThinking(false);
    }
  }

  async function finish() {
    if (mode === "live" && turns.some((t) => t.role === "user")) {
      setThinking(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          /* unitId matters here, not just on "say": the review is what writes
             the attempt rows, and without it every conversation was logged
             against no scenario at all. /ueben's "✓ geführt" reads exactly
             that column and was therefore never true for anyone. */
          body: JSON.stringify({
            action: "review",
            unitId: payload.unitId,
            history: turns,
          }),
        });
        const data = await res.json();
        setCorrections(data.corrections ?? []);
      } catch {
        setCorrections([]);
      } finally {
        setThinking(false);
      }
    } else {
      onDone();
    }
  }

  async function mic() {
    setListening(true);
    setVoiceError(null);
    try {
      setInput(await listenOnce());
    } catch {
      /* typing still works */
    } finally {
      setListening(false);
    }
  }

  /**
   * One hands-free turn: listen, send, and the reply is spoken by send(). Deliberately
   * turn-by-turn rather than a self-restarting loop.
   */
  async function voiceTurn() {
    if (thinking || listening) return;
    setListening(true);
    setVoiceError(null);
    try {
      const heard = await listenOnce(10000);
      setListening(false);
      if (heard.trim()) await send(heard);
      else setVoiceError("Nichts gehört. Nochmal?");
    } catch (e) {
      setListening(false);
      const why = e instanceof Error ? e.message : "";
      setVoiceError(
        why === "not-allowed"
          ? "Kein Mikrofon-Zugriff. Im Browser erlauben — oder tippen."
          : why === "no-speech" || why === "timeout"
            ? "Nichts gehört. Nochmal?"
            : "Spracherkennung hat nicht geklappt — tippen geht immer.",
      );
    }
  }

  /** The scripted conversation logs too. */
  function pick(o: DialogueOption) {
    setScriptLog((l) => [
      ...l,
      { who: "you", text: o.say, why: o.ok ? undefined : o.why },
    ]);
    if (!o.ok) {
      scriptOk.current = false;
      const right = dialogue[step]?.options.find((x) => x.ok);
      void record({
        kind: "conversation",
        refId: payload.unitId,
        correct: false,
        answer: o.say,
        expected: right?.say,
      });
    }
    if (o.next === -1 || !dialogue[o.next]) {
      // One row for a conversation with nothing wrong in it, so that talking
      // well is recorded rather than only talking badly.
      if (scriptOk.current) {
        void record({
          kind: "conversation",
          refId: payload.unitId,
          correct: true,
        });
      }
      setTimeout(onDone, 1200);
      return;
    }
    setStep(o.next);
    setTimeout(() => {
      setScriptLog((l) => [...l, { who: "them", text: dialogue[o.next].them }]);
      speak(dialogue[o.next].them);
    }, 500);
  }

  // ------------------------------------------------------------ corrections
  if (corrections) {
    return (
      <div>
        <Eyebrow>Nach dem Gespräch</Eyebrow>
        <Card>
          {corrections.length === 0 ? (
            <p className="font-serif text-center text-[20px] text-[#CFE3C8]">
              Keine Fehler gefunden. Sehr gut gemacht.
            </p>
          ) : (
            <div className="space-y-3.5">
              <p className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase">
                {corrections.length}{" "}
                {corrections.length === 1 ? "Korrektur" : "Korrekturen"}
              </p>
              {corrections.map((c, n) => (
                <div
                  key={n}
                  className="bg-bg border-line-sub rounded-xl border p-4"
                >
                  <p className="font-serif text-das/80 text-[16px] line-through">
                    {c.original}
                  </p>
                  <p className="font-serif text-fg mt-1 text-[18px]">
                    {c.corrected}
                  </p>
                  <p className="text-muted mt-2 text-[14px]">{c.why}</p>
                </div>
              ))}
            </div>
          )}
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

  const scripted = mode === "scripted";

  /**
   * Scripted mode with no script. Spec §17 says the session never dead-ends, and this was the one
   * screen that did.
   */
  if (scripted && !dialogue.length) {
    return (
      <Card>
        <p className="font-serif text-center text-[21px]">
          Gerade kein Gespräch möglich
        </p>
        <p className="text-muted mx-auto mt-3 max-w-[44ch] text-center text-[14px] leading-relaxed">
          {payload.scenario.role} — dieses Szenario wird gesprochen, es gibt
          keinen vorbereiteten Dialog dafür. Ohne Netz oder ohne Schlüssel geht
          es nicht. Die Sätze auf dieser Seite kannst du trotzdem üben; sie
          liegen auf dem Gerät.
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

  const log = scripted
    ? scriptLog
    : turns.map((t) => ({
        who: t.role === "user" ? "you" : "them",
        text: t.content,
        why: undefined,
      }));

  return (
    <div>
      {scripted && (
        <div className="border-line-sub bg-raised mb-4 flex items-center justify-center gap-2.5 rounded-lg border px-3 py-2">
          <span className="bg-accent h-[7px] w-[7px] flex-none rounded-full" />
          <span className="font-mono text-secondary text-[11.5px]">
            Offline-Variante — vorbereiteter Dialog
          </span>
        </div>
      )}

      <Eyebrow>
        {payload.from ? "Nochmal" : "Gespräch"} · {payload.scenario.role}
      </Eyebrow>

      <Card>
        <p className="text-muted mb-1 text-center text-[14px]">
          {payload.scenario.goal}
        </p>
        {/* Naming the origin turns "why this again?" into "right, that one" —
            and a scene you half-remember is the one worth redoing. */}
        {payload.from && (
          <p className="font-mono text-muted/70 mb-4 text-center text-[11.5px]">
            schon gemacht · {payload.from}
          </p>
        )}
        {!payload.from && <div className="mb-4" />}

        <div className="max-h-[300px] space-y-3 overflow-y-auto">
          {log.map((m, n) => (
            <div key={n} className={m.who === "you" ? "text-right" : ""}>
              <span
                className={`font-serif inline-block max-w-[85%] rounded-2xl px-4 py-2.5 text-left text-[17px] ${
                  m.who === "you" ? "bg-fg text-[#16211E]" : "bg-raised text-fg"
                }`}
              >
                {m.text}
              </span>
              {m.why && <p className="text-das/80 mt-1 text-[13px]">{m.why}</p>}
            </div>
          ))}
          {thinking && <p className="font-mono text-muted text-sm">…</p>}
          <div ref={endRef} />
        </div>

        {scripted ? (
          <div className="border-line-sub mt-5 space-y-2 border-t pt-4">
            {dialogue[step]?.options.map((o, n) => (
              <button
                key={n}
                onClick={() => pick(o)}
                className="border-line hover:bg-raised hover:border-line-strong font-serif w-full rounded-xl border px-4 py-3 text-left text-[17px] transition-colors"
              >
                {o.say}
              </button>
            ))}
          </div>
        ) : voice ? (
          /* ---------------------------------------------------- voice mode */
          <div className="border-line-sub mt-5 flex flex-col items-center gap-4 border-t pt-6">
            <button
              onClick={() => void voiceTurn()}
              disabled={thinking}
              aria-label={listening ? "Hört zu" : "Sprechen"}
              className={`flex h-[104px] w-[104px] items-center justify-center rounded-full border-2 text-[32px] transition-colors ${
                listening
                  ? "border-accent bg-[#2A2416] text-accent"
                  : thinking
                    ? "border-line text-muted"
                    : "border-line-strong text-secondary hover:border-fg hover:text-fg"
              }`}
            >
              🎤
            </button>

            <p className="font-mono text-muted text-[12px]">
              {listening
                ? "Hört zu — sprich jetzt"
                : thinking
                  ? "Denkt nach…"
                  : "Antippen und auf Deutsch antworten"}
            </p>

            {voiceError && (
              <p className="text-das text-center text-[13px]">{voiceError}</p>
            )}

            <div className="flex w-full flex-col gap-2 pt-2">
              <button
                onClick={() => setVoice(false)}
                className="font-mono text-muted hover:text-secondary text-[11.5px] transition-colors"
              >
                Lieber tippen
              </button>
              <button
                onClick={() => void finish()}
                disabled={thinking}
                className="border-line text-secondary hover:border-line-strong hover:text-fg w-full rounded-xl border py-3 text-[14px] transition-colors"
              >
                Gespräch beenden und korrigieren lassen
              </button>
            </div>
          </div>
        ) : (
          <>
            {micAvailable && (
              <button
                onClick={() => setVoice(true)}
                className="border-line-sub hover:border-line text-muted hover:text-secondary mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl border py-2.5 text-[13px] transition-colors"
              >
                🎤 Freihändig sprechen statt tippen
              </button>
            )}

            <div className="border-line-sub mt-5 flex gap-2 border-t pt-4">
              {micAvailable && (
                <button
                  onClick={() => void mic()}
                  disabled={listening || thinking}
                  title="Sprechen"
                  className={`rounded-xl border px-3.5 py-3 transition-colors ${
                    listening
                      ? "border-das bg-[#2A1F26]"
                      : "border-line hover:border-line-strong"
                  }`}
                >
                  🎤
                </button>
              )}
              <div className="flex-1">
                <GermanInput
                  value={input}
                  onChange={setInput}
                  onEnter={() => void send(input)}
                  disabled={thinking}
                  placeholder="Auf Deutsch antworten…"
                  ariaLabel="Deine Antwort"
                  keys={false}
                  className="border-line bg-bg font-serif focus:border-line-strong placeholder:text-muted w-full rounded-xl border px-4 py-3 text-[17px] outline-none"
                />
              </div>
              <button
                onClick={() => void send(input)}
                disabled={!input.trim() || thinking}
                className="bg-fg rounded-xl px-5 font-medium text-[#16211E] disabled:bg-[#243330] disabled:text-[#5C6B65]"
              >
                ↑
              </button>
            </div>

            <UmlautBar
              disabled={thinking}
              onInsert={(c) => setInput((v) => v + c)}
            />

            <button
              onClick={() => void finish()}
              disabled={thinking}
              className="border-line text-secondary hover:border-line-strong hover:text-fg mt-4 w-full rounded-xl border py-3 text-[14px] transition-colors"
            >
              Gespräch beenden und korrigieren lassen
            </button>
          </>
        )}
      </Card>

      <SkipLink onSkip={onSkip} />
    </div>
  );
}
