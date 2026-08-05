import Link from "next/link";
import { notFound } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ScenarioRunner from "@/app/szenario/[id]/ScenarioRunner";
import { survivalById } from "@/lib/survival";
import Phrases from "../Phrases";

export const dynamic = "force-dynamic";

/**
 * One survival conversation. Reuses the course's own runner and conversation engine — the only
 * thing different is the brief.
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
        <p className="text-secondary mt-2 text-[15px] leading-relaxed">
          {s.why}
        </p>

        <div className="mt-7">
          <ScenarioRunner
            payload={{
              scenario: s.scenario,
              /* The scripted fallback, for no key, no budget or no signal. */
              dialogue: s.dialogue ?? null,
              unitId: s.id,
            }}
          />
        </div>

        {/* Both halves stay on screen beside the conversation. The point is
            not to test you — it is to get you through the appointment. */}
        <section className="border-line-sub mt-10 border-t pt-6">
          <h2 className="font-mono text-muted mb-4 text-[11.5px] tracking-[0.14em] uppercase">
            Das sagst du
          </h2>
          <Phrases lines={s.phrases} />
        </section>

        {s.hear && s.hear.length > 0 && (
          <section className="border-line-sub mt-8 border-t pt-6">
            <h2 className="font-mono text-muted mb-1 text-[11.5px] tracking-[0.14em] uppercase">
              Das hörst du
            </h2>
            <p className="text-muted mb-4 max-w-[62ch] text-[12.5px] leading-relaxed">
              Die Fragen, die zurückkommen. Langsamer vorgelesen als sie dort
              gesprochen werden — im Gespräch oben kommen sie in Tempo.
            </p>
            <Phrases lines={s.hear} slow />
          </section>
        )}

        <section className="border-line-sub mt-8 border-t pt-6">
          <h2 className="font-mono text-muted mb-3 text-[11.5px] tracking-[0.14em] uppercase">
            Mitbringen
          </h2>
          <ul className="space-y-1.5">
            {s.bring.map((b) => (
              <li
                key={b}
                className="text-secondary flex items-start gap-2.5 text-[14.5px]"
              >
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
