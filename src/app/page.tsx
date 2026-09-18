"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useOnline } from "@/lib/hooks";
import { shouldIgnoreKey } from "@/lib/keys";
import { tourSeen } from "@/lib/tour";
import { plural } from "@/lib/plural";
import { NEW_WORDS_PER_DAY } from "@/lib/config";
import { recommendationFor } from "@/lib/recommendation";

type Plan = {
  user: { id: string; name: string; level: string };
  /** The name to greet this learner by, or null for a generic greeting. */
  displayName: string | null;
  streak: number;
  unit: { id: string; ord: number; title: string } | null;
  /* What tomorrow opens, by name. */
  next: { ord: number; title: string } | null;
  canDo: string[];
  blocks: { kind: string; title: string; minutes: number; offline: boolean }[];
  totalMinutes: number;
  mode: "normal" | "wiedereinstieg";
  dueTotal: number;
  unitsInLevel: number;
  /** How many new words today actually offers — 12, or 6 when the pace was cut. */
  pacing: { words: number; accuracy: number | null; reduced: boolean };
  /** Whole days skipped since the last session. */
  missed: number;
  /** No hearts left today — new material is paused, review still runs. */
  heartsEmpty: boolean;
  /** The one onboarding answer, or null when skipped/not asked. */
  situation: string | null;
};

/**
 * A one-line nudge for the Alltag card, personalised by the onboarding
 * answer — copy only, not a recommendation engine. Everyone still sees the
 * same card and the same link; only the words change.
 */
function alltagPitch(situation: string | null): string {
  switch (situation) {
    case "just_arrived":
      return "You're here now — practice the conversations you'll have this week.";
    case "university":
      return "Including the Prüfungsamt — the conversation every student has.";
    case "student_job":
      return "The closest thing here to a job interview — more is coming.";
    case "moving_soon":
      return "The conversations waiting for you when you land.";
    default:
      return "Practice a situation you may face in Germany.";
  }
}

type State = "loading" | "normal" | "empty" | "offline" | "error";

/** The two events with no server-side moment to hang off already — see api/track.
    Never carries the name itself, only that a name/recommendation was shown. */
function track(event: string, properties: Record<string, unknown> = {}) {
  void fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, properties }),
  }).catch(() => {});
}

/*
 * Unrelated to personalization, found while testing at 1am: this had no
 * night bucket at all, so anything before 11am — including 1am — read as
 * "Guten Morgen". "Gute Nacht" is already-taught A1.1 vocabulary (unit 1),
 * so it costs nothing new to use here.
 */
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Gute Nacht";
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  if (h < 22) return "Guten Abend";
  return "Gute Nacht";
}

export default function Home() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [state, setState] = useState<State>("loading");
  const [lastTry, setLastTry] = useState<string>("");
  const online = useOnline();

  /**
   * `state` starts at "loading", so nothing needs to set it on mount. Every write happens after
   * the await, never synchronously inside the effect.
   */
  const [nonce, setNonce] = useState(0);

  /* First visit on this browser goes to the tour. */
  useEffect(() => {
    if (!tourSeen()) router.replace("/willkommen?neu=1");
  }, [router]);

  useEffect(() => {
    let stale = false;

    (async () => {
      try {
        const res = await fetch("/api/session");
        /* A 401 is not a network problem, and showing "Tagesplan nicht geladen"
           for it told a signed-out visitor the server was broken. The cookie
           can expire between the middleware check and this fetch, so the page
           has to handle it too rather than assuming the gate caught it. */
        if (res.status === 401) {
          router.replace("/anmelden");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data: Plan = await res.json();
        if (stale) return;
        setPlan(data);
        setState(data.blocks.length === 0 ? "empty" : "normal");
        // No name or situation value in the properties — these events only
        // say THAT personalization showed, never what it said.
        if (data.displayName) track("personalization_name_used", { location: "welcome" });
        if (data.situation) track("recommendation_shown", { situation: data.situation });
      } catch {
        if (stale) return;
        setState("error");
        setLastTry(
          new Date().toLocaleTimeString("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        );
      }
    })();

    return () => {
      stale = true;
    };
  }, [nonce, router]);

  // Enter starts the session — the whole product is one button, so it gets
  // the most obvious key on the keyboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Also covers overlays: Enter with the shortcut sheet open should close
      // nothing and start nothing, not launch a session behind it.
      if (shouldIgnoreKey(e)) return;
      if (e.key === "Enter" && (state === "normal" || state === "error")) {
        e.preventDefault();
        router.push("/session");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, router]);

  // "von 20" was hardcoded, which was only ever right for A1.1 — the level the
  // app could never leave. The count comes from the level now.
  const meta = plan
    ? `${plan.user.level}${
        plan.unit ? ` · Unit ${plan.unit.ord} von ${plan.unitsInLevel}` : ""
      }${plan.streak > 0 ? ` · Tag ${plan.streak}` : ""}`
    : "";

  // Deterministic, pure — see lib/recommendation.ts. Falls back to "continue
  // the course" for a null/unrecognised situation, same as everyone gets.
  const recommendation = recommendationFor(plan?.situation ?? null);

  /* Offline is a banner over the normal layout, not a different screen —
     the session runs offline, so nothing about the page should look broken. */
  const missed = plan?.missed ?? 0;
  const banner =
    state === "error"
      ? { dot: "bg-das", text: "Tagesplan nicht geladen — lokal weiter" }
      : !online && state === "normal"
        ? {
            dot: "bg-accent",
            /* Said "Ersatzübung statt Video". */
            text: "Offline — alles außer dem Gespräch geht",
          }
        : missed > 0
          ? {
              dot: "bg-das",
              /*
               * A missed day used to be invisible. Yesterday's button said
               * 66 min, today's said 88, and nothing anywhere admitted that a
               * day had been lost — so the extra half hour read as the app
               * being erratic rather than as work carried over.
               */
              text:
                missed === 1
                  ? "Gestern ausgelassen — die Karten von gestern sind in der heutigen Sitzung"
                  : `${missed} Tage ausgelassen — die fälligen Karten sind in der heutigen Sitzung`,
            }
          : plan?.heartsEmpty && plan.unit
            ? {
                dot: "bg-das",
                // Otherwise a learner out of hearts just sees a shorter
                // session with no explanation for why new material stopped.
                // Guarded on `unit`: with the course finished there is no new
                // material to gate, so the message would be meaningless noise.
                text: "Keine Herzen mehr heute — neue Wörter gibt's morgen wieder",
              }
            : plan?.pacing.reduced && plan.unit
              ? {
                  dot: "bg-die",
                  // newWordBudget's own doc comment says it must be able to
                  // say why it slowed down "rather than quietly giving you
                  // less" — nothing read `reduced` or `accuracy` until now.
                  text: `Nur ${plan.pacing.words} statt ${NEW_WORDS_PER_DAY} neue Wörter heute — ${plan.pacing.accuracy}% Trefferquote diese Woche`,
                }
              : null;

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      {banner && (
        <div className="bg-raised border-line-sub flex flex-none items-center gap-2.5 border-b px-6 py-3.5 md:px-10">
          <span
            className={`h-[7px] w-[7px] flex-none rounded-full ${banner.dot}`}
          />
          <span className="font-mono text-secondary text-[12.5px]">
            {banner.text}
          </span>
        </div>
      )}

      <div className="flex flex-1 items-center px-6 py-12 md:px-10">
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-12 md:flex-row md:items-start md:gap-20">
          {state === "loading" ? (
            /* The shape of what's coming, not a spinner. The page doesn't jump
               when the plan lands, because the boxes are already the right size. */
            <>
              <div className="flex flex-1 flex-col gap-7">
                <div className="flex flex-col gap-3">
                  <div className="dm-skeleton h-4 w-40" />
                  <div className="dm-skeleton h-11 w-72 max-w-full" />
                </div>
                <div className="flex flex-col gap-3">
                  <div className="dm-skeleton h-3 w-28" />
                  <div className="dm-skeleton h-5 w-full max-w-[380px]" />
                  <div className="dm-skeleton h-5 w-full max-w-[330px]" />
                  <div className="dm-skeleton h-5 w-full max-w-[300px]" />
                </div>
              </div>
              <div className="flex w-full flex-none flex-col gap-4 md:w-[400px]">
                <div className="dm-skeleton h-[98px] w-full" />
                <div className="dm-skeleton h-[52px] w-full" />
              </div>
            </>
          ) : (
            <>
              {/* ---------------------------------------------- left column */}
              <div className="flex flex-1 flex-col gap-7">
                <div className="flex flex-col gap-2">
                  <div className="font-mono text-muted text-[13px]">{meta}</div>
                  <h1 className="font-serif text-[34px] leading-[1.1] font-semibold tracking-[-0.015em] md:text-[46px]">
                    {state === "empty"
                      ? "Du bist durch für heute."
                      : plan?.displayName
                        ? `${greeting()}, ${plan.displayName}.`
                        : `${greeting()}.`}
                  </h1>
                </div>

                {state === "normal" && (
                  <Link
                    href={recommendation.href}
                    className="border-line-sub hover:border-line group flex flex-col gap-0.5 rounded-xl border px-4 py-3 transition-colors"
                  >
                    <span className="font-mono text-muted text-[10.5px] tracking-[0.14em] uppercase">
                      Empfehlung für dich{" "}
                      <span className="opacity-60">· recommended for you</span>
                    </span>
                    <span className="font-serif group-hover:text-accent text-[16px] transition-colors">
                      {recommendation.title}
                    </span>
                  </Link>
                )}

                {state === "normal" && plan!.canDo.length > 0 && (
                  <div className="dm-stagger flex flex-col gap-3">
                    <div className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase">
                      Heute lernst du{" "}
                      <span className="opacity-60">· today you learn</span>
                    </div>
                    {plan!.canDo.map((c) => (
                      <div key={c} className="flex items-start gap-3">
                        <span className="border-line-strong mt-[7px] h-3 w-3 flex-none rounded-[2px] border" />
                        <span className="font-serif text-[18px] leading-[1.45] md:text-[20px]">
                          {c}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {state === "empty" && (
                  <p className="text-secondary max-w-[420px] text-[15px] leading-[1.55]">
                    Keine Wiederholungen fällig, keine neue Unit.
                    {plan?.next && ` „${plan.next.title}“ öffnet morgen früh.`}
                  </p>
                )}

                {state === "error" && (
                  <p className="text-secondary max-w-[400px] text-[15px] leading-[1.55]">
                    Der heutige Plan konnte nicht geladen werden. Deine Karten
                    liegen auf dem Gerät — du kannst sofort wiederholen.
                  </p>
                )}

                {state === "normal" && !online && (
                  <p className="text-secondary max-w-[400px] text-[15px] leading-[1.55]">
                    Alle Karten und der Lesetext liegen auf dem Gerät. Nur das
                    Gespräch braucht Netz.
                  </p>
                )}
              </div>

              {/* --------------------------------------------- right column */}
              <div className="flex w-full flex-none flex-col gap-4 md:w-[400px]">
                {state === "empty" ? (
                  <>
                    <Link
                      href="/wortschatz"
                      className="border-line hover:border-line-strong hover:text-fg text-secondary flex flex-col items-start gap-1.5 rounded-[14px] border px-6 py-5 transition-colors"
                    >
                      <span className="text-[19px] font-medium">
                        Freiwillig weiterüben
                      </span>
                      <span className="font-mono text-muted text-[12.5px]">
                        Wortschatz lesen · zählt nicht als Sitzung
                      </span>
                    </Link>
                    {plan?.next && (
                      <div className="font-mono text-muted text-[12.5px]">
                        Morgen: {plan.next.title}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <Link
                      href="/session"
                      className="bg-accent dm-pill flex w-full flex-col items-start gap-[7px] rounded-[14px] px-7 py-6 text-accent-fg transition-colors hover:bg-accent-hover"
                    >
                      <span className="text-[22px] font-semibold tracking-[-0.01em] md:text-[24px]">
                        ▶&nbsp;&nbsp;
                        {state === "error"
                          ? plural(
                              plan?.dueTotal ?? 0,
                              "Wiederholung",
                              "Wiederholungen",
                            )
                          : "Heutige Sitzung"}
                      </span>
                      {/* The one button the whole app is built around, and it
                          said only "Heutige Sitzung" — precisely the phrase a
                          day-one beginner cannot read. The most important
                          control on the screen was the least legible thing on
                          it. */}
                      {/* text-accent-fg, not text-line-strong: line-strong is
                          a light lavender meant for muted text on a cream
                          background, and its contrast against the hot-pink
                          fill here was under 1.5:1 — not just on hover, all
                          the time. accent-fg at reduced opacity keeps the
                          same visual hierarchy (dimmer than the heading)
                          while staying legible. */}
                      <span className="font-mono text-accent-fg/80 text-[12px]">
                        {state === "error"
                          ? "your reviews, from this device"
                          : "today's session — press to start"}
                      </span>
                      <span className="font-mono text-accent-fg/90 text-[13px]">
                        {state === "error"
                          ? "aus dem lokalen Deck"
                          : [
                              `${plan!.totalMinutes} min`,
                              plan!.dueTotal > 0 &&
                                plural(
                                  plan!.dueTotal,
                                  "Wiederholung",
                                  "Wiederholungen",
                                ),
                              /* The real number, not the usual one. */
                              plan!.blocks.some(
                                (b) => b.kind === "new-vocab",
                              ) &&
                                plural(
                                  plan!.pacing.words,
                                  "neues Wort",
                                  "neue Wörter",
                                ),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </span>
                    </Link>

                    {state === "error" ? (
                      <button
                        onClick={() => {
                          setState("loading");
                          setNonce((n) => n + 1);
                        }}
                        className="border-line hover:border-line-strong hover:text-fg font-mono text-secondary rounded-xl border px-5 py-3.5 text-left text-[12.5px] transition-colors"
                      >
                        Erneut versuchen{lastTry && ` · zuletzt ${lastTry}`}
                      </button>
                    ) : (
                      <>
                        {/* Block rail. Shows shape and length, not a menu —
                            there is nothing here to click. */}
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-1">
                            {plan!.blocks.map((b, i) => (
                              <span
                                key={i}
                                title={b.title}
                                className="bg-line h-1 flex-1 rounded-[2px]"
                              />
                            ))}
                          </div>
                          <div className="font-mono text-muted flex justify-between text-[12px]">
                            <span>
                              {plan!.blocks.length} Blöcke ·{" "}
                              {plan!.blocks[0]?.title} →{" "}
                              {plan!.blocks.at(-1)?.title}
                            </span>
                            <span>≈ {plan!.totalMinutes} min</span>
                          </div>
                        </div>

                        {/* The escape valve. Deliberately quiet and secondary —
                            it should be findable on a bad day, not tempting on
                            a good one. */}
                        <Link
                          href="/session?kurz=1"
                          className="border-line-sub hover:border-line text-muted hover:text-secondary flex items-center justify-between rounded-xl border px-5 py-3 transition-colors"
                        >
                          {/* Both halves used to be hardcoded and both were
                              wrong: the short session is up to four blocks and
                              nearer 28 minutes than 20, and which blocks appear
                              depends on what is actually due. What IS always
                              true is the rule that defines the shape — nothing
                              new, only the things that decay. */}
                          <span className="flex flex-col text-[14px] leading-tight">
                            Kürzere Sitzung heute
                            <span className="font-mono text-[10.5px] opacity-65">
                              shorter session today
                            </span>
                          </span>
                          <span className="font-mono flex flex-col items-end text-[11.5px] leading-tight">
                            Nur Wiederholen · nichts Neues
                            <span className="text-[10.5px] opacity-65">
                              review only · nothing new
                            </span>
                          </span>
                        </Link>

                        {/* Nothing in its place on a phone: the button above
                            is the largest thing on the screen and obviously
                            tappable, so the honest touch version of this line
                            is no line. */}
                        <div className="font-mono text-muted kbd-hint items-center gap-2.5 pt-1 text-[12px] md:flex">
                          <span className="kbd text-fg">Enter</span> startet die
                          Sitzung
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* The second of the two things this app is for. Deliberately
                    quiet — bordered, not filled — so it never competes with
                    the one button above it, but always visible: the two
                    paths are "continue the course" and "get ready for a real
                    conversation", and only one of them had a way in. */}
                <Link
                  href="/alltag"
                  className="border-line hover:border-line-strong hover:bg-raised flex flex-col items-start gap-1 rounded-[14px] border px-6 py-4 transition-colors"
                >
                  <span className="text-[15px] font-medium">
                    German for real life
                  </span>
                  <span className="text-muted text-[12.5px] leading-snug">
                    {alltagPitch(plan?.situation ?? null)}
                  </span>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
