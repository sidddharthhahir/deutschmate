"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playAudio } from "@/lib/speech";
import {
  scoreExam,
  type Exam,
  type ExamQuestion,
  type SectionKey,
} from "@/lib/exam-score";

type Phase = "idle" | "loading" | "running" | "done" | "error";

type Flat = ExamQuestion & { sectionTitle: string; instruction: string };

const SECTION_TITLE: Record<SectionKey, string> = {
  lesen: "Lesen",
  hoeren: "Hören",
  wortschatz: "Wortschatz",
  grammatik: "Grammatik",
};

/**
 * The exam runner. Only the final score needs a round trip, and it retries nothing — if it fails,
 * the page says the result wasn't saved rather than quietly dropping it.
 */
export default function ExamRunner({ level }: { level: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [exam, setExam] = useState<Exam | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const [saved, setSaved] = useState<"pending" | "ok" | "failed">("pending");
  const startedAt = useRef(0);

  /**
   * A mirror of `answers` for the clock to read. Answer four questions inside a second and the
   * timer never ticks at all — it sits still and then jumps.
   */
  const picksRef = useRef<(number | null)[]>([]);

  const setPicks = useCallback((next: (number | null)[]) => {
    picksRef.current = next;
    setAnswers(next);
  }, []);

  const flat: Flat[] = useMemo(() => {
    if (!exam) return [];
    return exam.sections.flatMap((s) =>
      s.questions.map((q) => ({
        ...q,
        sectionTitle: s.title,
        instruction: s.instruction,
      })),
    );
  }, [exam]);

  // ------------------------------------------------------------------ finish

  const finish = useCallback(async (picks: (number | null)[], paper: Exam) => {
    setPhase("done");
    const minutes = Math.max(
      1,
      Math.round((Date.now() - startedAt.current) / 60000),
    );

    const { questions, sections } = scoreExam(paper, picks);

    try {
      const res = await fetch("/api/pruefung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: paper.level,
          minutes,
          sections,
          answers: questions.map((q, n) => ({
            section: q.section,
            prompt: q.prompt,
            picked: picks[n] === null ? "—" : q.options[picks[n]!],
            expected: q.options[q.answer],
            correct: picks[n] === q.answer,
          })),
        }),
      });
      setSaved(res.ok ? "ok" : "failed");
    } catch {
      setSaved("failed");
    }
  }, []);

  // ------------------------------------------------------------------- clock

  useEffect(() => {
    if (phase !== "running" || !exam) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline) {
        clearInterval(id);
        void finish(picksRef.current, exam);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, deadline, exam, finish]);

  // ------------------------------------------------------------------- start

  async function start() {
    setPhase("loading");
    try {
      const res = await fetch(
        `/api/pruefung?level=${encodeURIComponent(level)}`,
      );
      const paper = (await res.json()) as Exam;
      if (!paper.total) return setPhase("error");
      setExam(paper);
      setPicks(Array(paper.total).fill(null));
      setI(0);
      setSaved("pending");
      startedAt.current = Date.now();
      setNow(Date.now());
      setDeadline(Date.now() + paper.minutes * 60_000);
      setPhase("running");
    } catch {
      setPhase("error");
    }
  }

  // ------------------------------------------------------------------ render

  if (phase === "idle" || phase === "loading" || phase === "error") {
    return (
      <div className="border-line rounded-[14px] border p-6 md:p-8">
        <p className="font-serif text-[22px] font-medium">Übungstest {level}</p>
        <p className="text-secondary mt-2 max-w-[58ch] text-[15px] leading-relaxed">
          30 Fragen aus vier Teilen, 30 Minuten, keine Rückmeldung bis zum
          Schluss.
        </p>
        {phase === "error" && (
          <p className="text-das mt-3 text-[14px]">
            Der Test konnte nicht geladen werden. Für diese Stufe gibt es noch
            nicht genug Inhalt, oder die Verbindung war weg.
          </p>
        )}
        <button
          onClick={() => void start()}
          disabled={phase === "loading"}
          className="bg-fg mt-6 rounded-xl px-8 py-4 font-medium text-[#16211E] transition-colors hover:bg-white disabled:opacity-50"
        >
          {phase === "loading" ? "Wird geladen…" : "Test starten"}
        </button>
      </div>
    );
  }

  if (!exam) return null;

  // ------------------------------------------------------------------- done
  if (phase === "done") {
    const { questions, sections, correct } = scoreExam(exam, answers);

    return (
      <div>
        <div className="border-line rounded-[14px] border p-6 md:p-8">
          <p className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase">
            Ergebnis
          </p>
          <p className="font-serif mt-2 text-[56px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
            {correct}
            <span className="text-muted text-[28px]">/{questions.length}</span>
          </p>

          <div className="mt-7 space-y-3">
            {sections.map((s) => (
              <div key={s.key}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span className="text-secondary">{SECTION_TITLE[s.key]}</span>
                  <span className="font-mono text-muted tabular-nums">
                    {s.correct} / {s.total}
                  </span>
                </div>
                <div className="bg-line h-1.5 w-full overflow-hidden rounded-[2px]">
                  <div
                    className="bg-fg h-full rounded-[2px]"
                    style={{ width: `${(s.correct / s.total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* The honest caveat, on the results screen where it matters, not
              buried in an intro nobody re-reads. */}
          <p className="text-muted border-line-sub mt-7 max-w-[62ch] border-t pt-5 text-[13px] leading-relaxed">
            Das ist ein Übungstest aus dem Inhalt dieser App — nicht der
            offizielle Modellsatz und keine Vorhersage, ob du die echte Prüfung
            bestehst. Was er dir sagt: welcher der vier Teile bei dir
            hinterherhinkt.
          </p>
          <p className="font-mono mt-3 text-[12px]">
            {saved === "ok" ? (
              <span className="text-muted">Ergebnis gespeichert.</span>
            ) : saved === "failed" ? (
              <span className="text-das">
                Ergebnis nicht gespeichert — offline?
              </span>
            ) : (
              <span className="text-muted">Wird gespeichert…</span>
            )}
          </p>
        </div>

        {/* Every question, with what you picked. The review is the point —
            a score with no answer key teaches nothing. */}
        <div className="mt-6 space-y-2">
          {questions.map((q, n) => {
            const ok = answers[n] === q.answer;
            return (
              <div
                key={q.id}
                className={`rounded-xl border p-4 ${
                  ok ? "border-line-sub" : "border-[#4A2F3D] bg-[#251A20]/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 text-[13px] ${ok ? "text-accent" : "text-das"}`}
                  >
                    {ok ? "✓" : "✕"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-muted text-[10.5px] tracking-[0.12em] uppercase">
                      {SECTION_TITLE[q.section]}
                    </p>
                    <p className="font-serif mt-1 text-[17px]">{q.prompt}</p>
                    {q.section === "hoeren" && q.context && (
                      <p className="font-serif text-secondary mt-1 text-[15px]">
                        {q.context}
                      </p>
                    )}
                    {!ok && (
                      <p className="mt-1.5 text-[13.5px]">
                        <span className="text-muted">
                          du:{" "}
                          {answers[n] === null ? "—" : q.options[answers[n]!]}
                        </span>
                        <span className="text-secondary ml-3">
                          richtig: {q.options[q.answer]}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => void start()}
            className="border-line text-secondary hover:border-line-strong hover:text-fg rounded-xl border px-6 py-3.5 text-[15px] transition-colors"
          >
            Neuer Test
          </button>
          <Link
            href="/"
            className="bg-fg rounded-xl px-6 py-3.5 text-[15px] font-medium text-[#16211E] transition-colors hover:bg-white"
          >
            Fertig
          </Link>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- running
  const q = flat[i];
  const left = Math.max(0, deadline - now);
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  const answered = answers.filter((a) => a !== null).length;

  function pick(n: number) {
    setPicks(answers.map((v, k) => (k === i ? n : v)));
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <span className="font-mono text-muted text-[12.5px]">
          {q.sectionTitle} · {i + 1} von {flat.length}
        </span>
        <span
          className={`font-mono text-[13px] tabular-nums ${
            left < 120_000 ? "text-das" : "text-secondary"
          }`}
        >
          {mm}:{String(ss).padStart(2, "0")}
        </span>
      </div>

      {/* One cell per question: answered, current, untouched. Doubles as the
          "have I missed one" check that every paper exam gives you for free. */}
      <div className="mb-6 flex gap-[3px]">
        {flat.map((_, n) => (
          <button
            key={n}
            onClick={() => setI(n)}
            aria-label={`Frage ${n + 1}`}
            className={`h-1.5 flex-1 rounded-[1px] transition-colors ${
              n === i
                ? "bg-fg"
                : answers[n] !== null
                  ? "bg-line-strong"
                  : "bg-line"
            }`}
          />
        ))}
      </div>

      <div
        key={q.id}
        className="dm-rise border-line bg-surface rounded-[14px] border p-6 md:p-8"
      >
        <p className="font-mono text-muted mb-5 text-[11.5px]">
          {q.instruction}
        </p>

        {q.section === "lesen" && q.context && (
          <div className="border-line-sub bg-bg mb-6 max-h-[280px] overflow-y-auto rounded-xl border p-5">
            <div className="font-serif mx-auto max-w-[58ch] space-y-3 text-[16px] leading-[1.7]">
              {q.context.split("\n\n").map((p, n) => (
                <p key={n}>{p}</p>
              ))}
            </div>
          </div>
        )}

        {q.section === "hoeren" && q.context && (
          <div className="mb-6 flex justify-center">
            <button
              onClick={() => playAudio(q.audio ?? null, q.context!)}
              className="border-line-strong text-secondary hover:border-fg hover:text-fg flex items-center gap-3 rounded-full border px-6 py-3.5 text-[15px] transition-colors"
            >
              <span className="text-[12px]">▶</span> Abspielen
            </button>
          </div>
        )}

        <p className="font-serif mb-6 text-center text-[22px] md:text-[26px]">
          {q.prompt}
        </p>

        <div className="space-y-2">
          {q.options.map((o, n) => (
            <button
              key={n}
              onClick={() => pick(n)}
              className={`w-full rounded-xl border px-4 py-3.5 text-left text-[15px] transition-colors ${
                answers[i] === n
                  ? "border-fg bg-raised text-fg"
                  : "border-line hover:border-line-strong hover:bg-raised text-secondary"
              }`}
            >
              <span className="font-mono text-muted mr-3 text-[11.5px]">
                {String.fromCharCode(97 + n)}
              </span>
              {o}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-2.5">
        <button
          onClick={() => setI((n) => Math.max(0, n - 1))}
          disabled={i === 0}
          className="border-line text-secondary hover:border-line-strong hover:text-fg flex-none rounded-xl border px-5 py-4 text-[14px] transition-colors disabled:opacity-30"
        >
          Zurück
        </button>
        {i + 1 < flat.length ? (
          <button
            onClick={() => setI((n) => n + 1)}
            className="bg-fg flex-1 rounded-xl py-4 font-medium text-[#16211E] transition-colors hover:bg-white"
          >
            Weiter
          </button>
        ) : (
          <button
            onClick={() => void finish(answers, exam)}
            className="bg-fg flex-1 rounded-xl py-4 font-medium text-[#16211E] transition-colors hover:bg-white"
          >
            Abgeben · {answered} von {flat.length} beantwortet
          </button>
        )}
      </div>

      <button
        onClick={() => void finish(answers, exam)}
        className="font-mono text-muted hover:text-secondary mt-6 w-full text-center text-[11.5px] transition-colors"
      >
        Vorzeitig abgeben
      </button>
    </div>
  );
}
