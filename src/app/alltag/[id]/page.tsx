import Link from "next/link";
import { notFound } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ScenarioRunner from "@/app/szenario/[id]/ScenarioRunner";
import { survivalById } from "@/lib/survival";

export const dynamic = "force-dynamic";

/**
 * One survival conversation.
 *
 * Reuses the course's own runner and conversation engine — the only thing
 * different is the brief. The phrase list stays on screen beside it, because
 * the point is not to test you, it's to get you through the appointment.
 */
export default async function SurvivalScenario({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = survivalById(id);
  if (!s) notFound();

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[760px] flex-1 px-6 py-10 md:px-10">
        <Link
          href="/alltag"
          className="font-mono text-muted hover:text-secondary text-[12px] transition-colors"
        >
          ← Alltag
        </Link>

        <h1 className="font-serif mt-4 text-[30px] font-semibold tracking-[-0.015em]">
          {s.title}
        </h1>
        <p className="text-secondary mt-2 text-[15px] leading-relaxed">{s.why}</p>

        <div className="mt-7">
          <ScenarioRunner
            payload={{
              scenario: s.scenario,
              // No scripted fallback: these briefs are open conversations, and
              // a canned dialogue tree would teach the tree, not the situation.
              dialogue: null,
              unitId: s.id,
            }}
          />
        </div>

        <section className="border-line-sub mt-10 border-t pt-6">
          <h2 className="font-mono text-muted mb-4 text-[11.5px] tracking-[0.14em] uppercase">
            Sätze, die dort zählen
          </h2>
          <div className="space-y-2">
            {s.phrases.map((p) => (
              <div
                key={p.de}
                className="border-line-sub flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg border px-4 py-2.5"
              >
                <span className="font-serif text-fg text-[16.5px]">{p.de}</span>
                <span className="text-muted text-[13px]">{p.en}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="border-line-sub mt-8 border-t pt-6">
          <h2 className="font-mono text-muted mb-3 text-[11.5px] tracking-[0.14em] uppercase">
            Mitbringen
          </h2>
          <ul className="space-y-1.5">
            {s.bring.map((b) => (
              <li key={b} className="text-secondary flex items-start gap-2.5 text-[14.5px]">
                <span className="border-line-strong mt-[6px] h-3 w-3 flex-none rounded-[2px] border" />
                {b}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
