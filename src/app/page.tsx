"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useOnline } from "@/lib/hooks";
import { shouldIgnoreKey } from "@/lib/keys";
import { tourSeen } from "@/lib/tour";
import { plural } from "@/lib/plural";

type Plan = {
  user: { id: string; name: string; level: string };
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
};

type State = "loading" | "normal" | "empty" | "offline" | "error";

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
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

  /* Offline is a banner over the normal layout, not a different screen —
     the session runs offline, so nothing about the page should look broken. */
  const banner =
    state === "error"
      ? { dot: "bg-das", text: "Tagesplan nicht geladen — lokal weiter" }
      : !online && state === "normal"
        ? {
            dot: "bg-accent",
            /* Said "Ersatzübung statt Video". */
            text: "Offline — alles außer dem Gespräch geht",
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
                      : `${greeting()}, ${plan?.user.name ?? ""}`}
                  </h1>
                </div>

                {state === "normal" && plan!.canDo.length > 0 && (
                  <div className="dm-stagger flex flex-col gap-3">
                    <div className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase">
                      Heute lernst du
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
                      className="bg-fg flex w-full flex-col items-start gap-[7px] rounded-[14px] px-7 py-6 text-[#16211E] transition-colors hover:bg-white"
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
                      <span className="font-mono text-[13px] text-[#43574F]">
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
                          <span className="text-[14px]">
                            Kürzere Sitzung heute
                          </span>
                          <span className="font-mono text-[11.5px]">
                            Nur Wiederholen · nichts Neues
                          </span>
                        </Link>

                        <div className="font-mono text-muted flex items-center gap-2.5 pt-1 text-[12px]">
                          <span className="kbd text-fg">Enter</span> startet die
                          Sitzung
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
