"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ReviewBlock from "@/components/blocks/ReviewBlock";
import FixBlock from "@/components/blocks/FixBlock";
import NewVocabBlock from "@/components/blocks/NewVocabBlock";
import GrammarBlock from "@/components/blocks/GrammarBlock";
import ListeningBlock from "@/components/blocks/ListeningBlock";
import BuilderBlock from "@/components/blocks/BuilderBlock";
import ConversationBlock from "@/components/blocks/ConversationBlock";
import QuizBlock from "@/components/blocks/QuizBlock";
import WritingBlock from "@/components/blocks/WritingBlock";
import SpeakingBlock from "@/components/blocks/SpeakingBlock";
import ReadingBlock from "@/components/blocks/ReadingBlock";
import VideoBlock from "@/components/blocks/VideoBlock";
import ClozeBlock from "@/components/blocks/ClozeBlock";
import GrammarReviewBlock from "@/components/blocks/GrammarReviewBlock";
import SessionRecap, { type Recap } from "@/components/SessionRecap";
import { useOnline } from "@/lib/hooks";
import { cachePlan, cachedPlan, flush, onOutboxChange, pendingCount, send } from "@/lib/outbox";
import { myKey } from "@/lib/who";
import { shouldIgnoreKey } from "@/lib/keys";
import { plural } from "@/lib/plural";

type Block = {
  kind: string;
  title: string;
  minutes: number;
  offline: boolean;
  skippable: boolean;
  payload: unknown;
};

type Plan = {
  user: { id: string; name: string; level: string };
  unit: { id: string; ord: number; title: string } | null;
  canDo: string[];
  blocks: Block[];
  totalMinutes: number;
  mode: "normal" | "wiedereinstieg";
  dueTotal: number;
  /** What comes after this unit, by name — the recap's "Morgen". */
  next: { ord: number; title: string } | null;
};

/**
 * Where a half-finished session lives.
 *
 * All session state used to be in React memory, so a refresh, a phone call or
 * a laptop going to sleep at block 6 of 8 threw away the whole hour — nothing
 * logged, no streak, cards ungraded. This is the smallest thing that fixes it.
 *
 * `spentMs` accumulates only time actually spent IN the session. Storing a
 * single start timestamp would mean resuming after a three-hour lunch logged
 * three hours of study, which is exactly the kind of number this app is not
 * allowed to invent.
 */
/* Scoped to the learner. Unscoped, switching user on /wer offered the other
   person's half-finished session as "Weiter?" — see lib/who.ts. */
const SAVE_BASE = "dm.session.v2";
const saveKey = () => myKey(SAVE_BASE);

type Saved = { date: string; shape: string; completed: string[]; spentMs: number };

const today = () => new Date().toISOString().slice(0, 10);

function readSaved(shape: string): Saved | null {
  try {
    const raw = localStorage.getItem(saveKey());
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    // Yesterday's half-session is not resumable: the plan is rebuilt daily and
    // its block list will not match.
    if (s.date !== today() || s.shape !== shape) return null;
    if (!Array.isArray(s.completed) || s.completed.length === 0) return null;
    return s;
  } catch {
    return null;
  }
}

/**
 * Where to pick up, given a freshly built plan and the blocks already done.
 *
 * Resuming by stored INDEX was wrong. The plan is rebuilt on every load and
 * legitimately shrinks as you work: finish the reviews and the review block is
 * gone next time, finish the gaps and Lücken disappears. Index 3 then points
 * at a different block than it did, and the runner would silently skip or
 * repeat one. Block kinds are unique within a plan, so matching on them
 * survives the plan changing underneath.
 */
function resumeIndex(blocks: { kind: string }[], completed: string[]): number {
  const done = new Set(completed);
  const at = blocks.findIndex((b) => !done.has(b.kind));
  return at === -1 ? blocks.length : at;
}

function clearSaved() {
  try {
    localStorage.removeItem(saveKey());
  } catch {
    /* private mode — resume is a nicety, never a requirement */
  }
}

export default function SessionPage() {
  return (
    <Suspense fallback={<Centre>Lade…</Centre>}>
      <SessionRunner />
    </Suspense>
  );
}

/**
 * The session runner (spec §3).
 *
 * Fixed rhythm, variable content. The user pressed one button; from here they
 * make no navigation decisions until the recap.
 */
function SessionRunner() {
  const params = useSearchParams();
  const shape = params.get("kurz") === "1" ? "short" : "full";

  const [plan, setPlan] = useState<Plan | null>(null);
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [streak, setStreak] = useState(0);
  // Captured once when the session ends. Must NOT be recomputed during render:
  // the recap would then drift upward while you sit on it, and disagree with
  // the value already written to session_log.
  const [minutes, setMinutes] = useState(0);
  /** A resumable save found on load. Null once the choice has been made. */
  const [offer, setOffer] = useState<{ saved: Saved; at: number } | null>(null);
  const [failed, setFailed] = useState(false);
  /** Running from the cached plan because the server was unreachable. */
  const [offline, setOffline] = useState(false);
  /** Answers waiting to sync. Shown, never hidden. */
  const [pending, setPending] = useState(0);
  /** Words still unintroduced in today's unit — it continues tomorrow. */
  const [carryOver, setCarryOver] = useState(0);

  const legStart = useRef(0);
  const spentMs = useRef(0);
  const completed = useRef<string[]>([]);

  // Date.now() during render is impure — start the clock in an effect instead.
  useEffect(() => {
    legStart.current = Date.now();
  }, []);

  useEffect(() => {
    let stale = false;
    (async () => {
      /* Try the server, fall back to today's cached plan. This is what makes
         principle 2 true rather than aspirational: the blocks always ran
         offline, but the PLAN came from the server, so a dead network meant no
         session at all. Grades go to the outbox and sync later. */
      let data: Plan | null = null;
      let fromCache = false;

      try {
        const res = await fetch(`/api/session?shape=${shape}`);
        if (!res.ok) throw new Error(String(res.status));
        data = (await res.json()) as Plan;
        cachePlan(shape, data);
      } catch {
        data = cachedPlan<Plan>(shape);
        fromCache = true;
      }

      if (stale) return;
      if (!data) {
        setFailed(true);
        return;
      }

      setPlan(data);
      setOffline(fromCache);
      const saved = readSaved(shape);
      const at = saved ? resumeIndex(data.blocks, saved.completed) : 0;
      if (saved && at > 0 && at < data.blocks.length) setOffer({ saved, at });
      else clearSaved();
    })();
    return () => {
      stale = true;
    };
  }, [shape]);

  /* Anything answered offline is replayed the moment the network is back.
     Nothing is set synchronously here — the first count arrives from flush()
     or from the outbox announcing a change, both of which are async. */
  useEffect(() => {
    const unsub = onOutboxChange(setPending);
    const sync = () => void flush().then(({ left }) => setPending(left));
    sync();
    window.addEventListener("online", sync);
    return () => {
      unsub();
      window.removeEventListener("online", sync);
    };
  }, []);

  /* Esc leaves the session.
     The header has read "Esc  Beenden" since the runner was written, and the
     shortcut sheet advertises it, and nothing listened for the key — the label
     was decoration next to a link. Guarded like every other global key, so it
     does not yank you out of the session while an overlay is up or while you
     are typing a sentence that happens to want Escape. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || shouldIgnoreKey(e)) return;
      window.location.href = "/";
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const blocks = useMemo(() => plan?.blocks ?? [], [plan]);
  const block = blocks[i];

  const finish = useCallback(async () => {
    const elapsed = Math.max(
      1,
      Math.round((spentMs.current + (Date.now() - legStart.current)) / 60000),
    );
    setMinutes(elapsed);
    setDone(true);
    clearSaved();

    // Queued when offline, so the session still counts once you reconnect.
    const data = await send<{
      recap: Recap;
      streak: number;
      wordsLeft: number;
    }>("/api/session", {
      minutes: elapsed,
      blocks: completed.current,
      // A short session is not a finished unit — it deliberately skips the
      // new material, so marking the unit complete would be a lie.
      completeUnit: shape === "short" ? undefined : plan?.unit?.id,
    });

    if (data) {
      setRecap(data.recap);
      setStreak(data.streak);
      // A big unit carries over. "Morgen: Unit 6" would be a straightforward
      // lie on the day Unit 5 still has four words left in it.
      if (data.wordsLeft > 0) setCarryOver(data.wordsLeft);
    }
    setPending(pendingCount());
  }, [plan, shape]);

  const advance = useCallback(() => {
    if (block) completed.current.push(block.kind);
    const next = i + 1;
    if (next >= blocks.length) {
      void finish();
      return;
    }
    setI(next);
    try {
      localStorage.setItem(
        saveKey(),
        JSON.stringify({
          date: today(),
          shape,
          completed: completed.current,
          spentMs: spentMs.current + (Date.now() - legStart.current),
        } satisfies Saved),
      );
    } catch {
      /* saving is best-effort; the session continues either way */
    }
  }, [block, i, blocks.length, finish, shape]);

  if (failed) {
    return (
      <main className="bg-bg flex min-h-screen items-center justify-center px-6">
        <div className="border-line bg-surface w-full max-w-[420px] rounded-[14px] border p-7 text-center">
          <p className="font-serif text-[22px]">Tagesplan nicht erreichbar</p>
          <p className="text-secondary mt-3 text-[14.5px] leading-relaxed">
            Der heutige Plan wurde noch nie geladen, deshalb liegt hier auch keine Kopie.
            Einmal mit Verbindung öffnen — danach läuft die Sitzung auch offline, und
            deine Antworten werden nachgereicht.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              onClick={() => {
                setFailed(false);
                setPlan(null);
                location.reload();
              }}
              className="bg-fg w-full rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
            >
              Nochmal versuchen
            </button>
            <Link
              href="/"
              className="border-line text-secondary hover:border-line-strong hover:text-fg w-full rounded-xl border py-3 text-[14px] transition-colors"
            >
              Zurück
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!plan) {
    return <Centre>Lade…</Centre>;
  }

  // ------------------------------------------------------------- resume gate
  if (offer) {
    return (
      <main className="bg-bg flex min-h-screen items-center justify-center px-6">
        <div className="border-line bg-surface w-full max-w-[440px] rounded-[14px] border p-7">
          <p className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase">
            Unterbrochen
          </p>
          <h1 className="font-serif mt-2 text-[26px] font-semibold">
            Du warst bei Block {offer.at + 1} von {blocks.length}
          </h1>
          <p className="text-secondary mt-3 text-[14.5px] leading-relaxed">
            {Math.round(offer.saved.spentMs / 60000)} Minuten sind schon gezählt. Weiter
            mit „{blocks[offer.at]?.title}“?
          </p>

          <div className="mt-7 flex flex-col gap-2.5">
            <button
              onClick={() => {
                completed.current = offer.saved.completed;
                spentMs.current = offer.saved.spentMs;
                legStart.current = Date.now();
                setI(offer.at);
                setOffer(null);
              }}
              className="bg-fg w-full rounded-xl py-4 font-medium text-[#16211E] transition-colors hover:bg-white"
            >
              Weitermachen
            </button>
            <button
              onClick={() => {
                clearSaved();
                legStart.current = Date.now();
                setOffer(null);
              }}
              className="border-line text-secondary hover:border-line-strong hover:text-fg w-full rounded-xl border py-3.5 text-[14px] transition-colors"
            >
              Von vorne anfangen
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ------------------------------------------------------------------ recap
  if (done) {
    return (
      <SessionRecap
        recap={recap}
        streak={streak}
        canDo={plan.canDo}
        minutes={minutes}
        /* Named, not numbered. Spec §4 forbids a bare unit number in as many
           words, and this is the line whose whole job is to make tomorrow
           sound worth turning up for — "Im Restaurant" does that, "Unit 15"
           does not. */
        nextUnit={
          carryOver > 0
            ? // "1 Wörter" is what a machine writes. This line is read by
              // someone learning the language it is written in.
              `${plan.unit?.title} weiter · ${plural(carryOver, "Wort", "Wörter")}`
            : plan.next
              ? plan.next.title
              : null
        }
      />
    );
  }

  if (!block) {
    return (
      <Centre>
        Nichts zu tun.{" "}
        <Link href="/" className="underline">
          Zurück
        </Link>
      </Centre>
    );
  }

  const skip = block.skippable ? advance : undefined;

  // The review block owns its own full-height chrome (progress rail, keyboard
  // legend, minutes remaining) because its layout is the whole screen. Every
  // other block sits inside the shared rail below.
  if (block.kind === "review") {
    return (
      <main className="bg-bg min-h-screen">
        <OfflineAware block={block} onDone={advance} onSkip={skip} />
      </main>
    );
  }

  return (
    <main className="bg-bg flex min-h-screen flex-col">
      <div className="flex flex-none flex-col gap-3.5 px-6 pt-6 md:px-10">
        <div className="flex items-center gap-4 md:gap-8">
          <Link
            href="/"
            className="font-mono text-muted hover:text-secondary w-[100px] text-[12.5px] transition-colors md:w-[160px]"
          >
            Esc&nbsp;&nbsp;Beenden
          </Link>
          {/* Rail: filled = done, current shows position, rest empty.
              No block is clickable — it reports, it isn't a menu. */}
          <div className="flex flex-1 gap-1">
            {blocks.map((b, n) => (
              <span
                key={n}
                title={b.title}
                className={`h-1 flex-1 rounded-[2px] ${
                  n < i ? "bg-fg" : n === i ? "bg-secondary" : "bg-line"
                }`}
              />
            ))}
          </div>
          <span className="font-mono text-secondary w-[100px] text-right text-[12.5px] md:w-[160px]">
            {blocks.slice(i).reduce((n, b) => n + b.minutes, 0)} min übrig
          </span>
        </div>
        <div className="font-mono text-muted text-center text-[12.5px]">
          {block.title} · Block {i + 1} von {blocks.length}
          {offline && " · offline"}
          {pending > 0 && ` · ${plural(pending, "Antwort wartet", "Antworten warten")} auf Sync`}
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center px-6 py-10 md:px-10">
        <div className="w-full max-w-[760px]">
          <OfflineAware block={block} onDone={advance} onSkip={skip} />
        </div>
      </div>
    </main>
  );
}

/**
 * Spec §17: the session never dead-ends.
 *
 * A block marked `offline: false` ships a `fallback` payload. If the browser is
 * offline we render that instead — no error, no empty screen, no round trip.
 */
function OfflineAware({
  block,
  onDone,
  onSkip,
}: {
  block: Block;
  onDone: () => void;
  onSkip?: () => void;
}) {
  const online = useOnline();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fb = (block.payload as any)?.fallback as
    | { kind: string; payload: unknown }
    | undefined;

  if (!online && !block.offline && fb) {
    return (
      <>
        {/* Named the block it replaced, which was always "Video" — the only
            block that ships a fallback. Since no video has ever been imported,
            this banner has never been rendered; keeping a video-specific
            sentence in it would be a promise about a feature with no data. */}
        <div className="mb-4 rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-center text-xs text-amber-200/70">
          Offline — Ersatzübung
        </div>
        <BlockRenderer kind={fb.kind} payload={fb.payload} onDone={onDone} onSkip={onSkip} />
      </>
    );
  }

  return <BlockRenderer kind={block.kind} payload={block.payload} onDone={onDone} onSkip={onSkip} />;
}

function BlockRenderer({
  kind,
  payload,
  onDone,
  onSkip,
}: {
  kind: string;
  payload: unknown;
  onDone: () => void;
  onSkip?: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = payload as any;
  switch (kind) {
    case "review":
      return <ReviewBlock payload={p} onDone={onDone} onSkip={onSkip} />;
    case "fix":
      return <FixBlock payload={p} onDone={onDone} onSkip={onSkip} />;
    case "cloze":
      return <ClozeBlock payload={p} onDone={onDone} onSkip={onSkip} />;
    case "grammar-review":
      return <GrammarReviewBlock payload={p} onDone={onDone} onSkip={onSkip} />;
    case "new-vocab":
      return <NewVocabBlock payload={p} onDone={onDone} />;
    case "new-grammar":
      return <GrammarBlock payload={p} onDone={onDone} />;
    case "listening":
      return <ListeningBlock payload={p} onDone={onDone} onSkip={onSkip} />;
    case "reading":
      return <ReadingBlock payload={p} onDone={onDone} onSkip={onSkip} />;
    case "video":
      return <VideoBlock payload={p} onDone={onDone} onSkip={onSkip} />;
    case "builder":
      return <BuilderBlock payload={p} onDone={onDone} onSkip={onSkip} />;
    case "conversation":
      return <ConversationBlock payload={p} onDone={onDone} onSkip={onSkip} />;
    case "writing":
      return <WritingBlock payload={p} onDone={onDone} onSkip={onSkip} />;
    case "speaking":
      return <SpeakingBlock payload={p} onDone={onDone} onSkip={onSkip} />;
    case "quiz":
      return <QuizBlock payload={p} onDone={onDone} />;
    default:
      onDone();
      return null;
  }
}

function Centre({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-bg text-muted font-mono flex min-h-screen items-center justify-center text-sm">
      {children}
    </main>
  );
}
