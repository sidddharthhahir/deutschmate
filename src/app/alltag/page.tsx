import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { survivalScenarios } from "@/lib/survival";

export const dynamic = "force-dynamic";

/**
 * Alltag — German with consequences.
 *
 * The course teaches you to order a coffee. This is the Bürgeramt, the WG
 * viewing and the phone contract you cannot get out of: the conversations
 * where not having the words costs you a room, a deadline or a month's money.
 */
export default function SurvivalPage() {
  const items = survivalScenarios();

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[760px] flex-1 px-6 py-10 md:px-10">
        <Link
          href="/ueben"
          className="font-mono text-muted hover:text-secondary text-[12px] transition-colors"
        >
          ← Üben
        </Link>

        <h1 className="font-serif mt-4 text-[32px] font-semibold tracking-[-0.015em]">
          Alltag in Deutschland
        </h1>
        <p className="text-secondary mt-3 max-w-[62ch] text-[15px] leading-relaxed">
          Sechs Gespräche, die du wirklich führen wirst. Jedes mit den Sätzen, die dort
          zählen, und der Liste, was du mitbringen musst.
        </p>

        {items.length === 0 ? (
          <p className="text-muted mt-8 text-[14px]">
            Keine Szenarien geladen — data/scenarios-survival.json fehlt.
          </p>
        ) : (
          <div className="mt-8 space-y-3">
            {items.map((s) => (
              <div key={s.id} className="border-line rounded-[14px] border p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="font-serif text-[22px] font-medium">{s.title}</h2>
                  <span className="font-mono text-muted flex-none text-[11px]">{s.level}</span>
                </div>

                <p className="text-secondary mt-2 max-w-[62ch] text-[14px] leading-relaxed">
                  {s.why}
                </p>

                <div className="mt-4">
                  <p className="font-mono text-muted mb-1.5 text-[10.5px] tracking-[0.14em] uppercase">
                    Mitbringen
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.bring.map((b) => (
                      <span
                        key={b}
                        className="border-line-sub text-secondary rounded-full border px-3 py-1 text-[12.5px]"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>

                <details className="group mt-4">
                  <summary className="font-mono text-muted hover:text-secondary cursor-pointer text-[12px] transition-colors">
                    {s.phrases.length} Sätze ansehen
                  </summary>
                  <div className="border-line-sub mt-3 space-y-2 border-t pt-3">
                    {s.phrases.map((p) => (
                      <div key={p.de} className="flex flex-wrap items-baseline gap-x-3">
                        <span className="font-serif text-fg text-[16px]">{p.de}</span>
                        <span className="text-muted text-[13px]">{p.en}</span>
                      </div>
                    ))}
                  </div>
                </details>

                <Link
                  href={`/alltag/${s.id}`}
                  className="bg-fg mt-5 inline-block rounded-xl px-6 py-3 text-[15px] font-medium text-[#16211E] transition-colors hover:bg-white"
                >
                  Gespräch üben
                </Link>
              </div>
            ))}
          </div>
        )}

        <p className="text-muted mt-10 max-w-[62ch] text-[12.5px] leading-relaxed">
          Das Gespräch benutzt dieselbe Regel wie überall: der Gegenüber verwendet nur
          Wörter, die du schon kennst. Ein Amt tut das nicht — dafür sind die Sätze oben da.
        </p>
      </div>
    </main>
  );
}
