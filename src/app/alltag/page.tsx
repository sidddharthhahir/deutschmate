import Link from "next/link";
import Page, { Empty } from "@/components/Page";
import { survivalScenarios } from "@/lib/survival";
import Phrases from "./Phrases";

export const dynamic = "force-dynamic";

/** Alltag — German with consequences. */
export default function SurvivalPage() {
  // Counted, not typed: the lead said "Six" while rendering twelve. Sorted by
  // level too — appended scenarios put an A1.2 after two B1.1s.
  const items = [...survivalScenarios()].sort(
    (a, b) => a.level.localeCompare(b.level) || a.ord - b.ord,
  );

  return (
    <Page
      back="/ueben"
      backLabel="Üben"
      title="Alltag in Deutschland"
      lead={`${items.length} conversations you will actually have, easiest first. Each with the phrases that matter, what they will say back, and the documents to bring.`}
    >
      <>
        {items.length === 0 ? (
          <Empty title="No scenarios loaded">
            data/scenarios-survival.json is missing. Run{" "}
            <code>npm run setup</code>.
          </Empty>
        ) : (
          <div className="space-y-3">
            {items.map((s) => (
              <div key={s.id} className="border-line rounded-[14px] border p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="font-serif text-[22px] font-medium">
                    {s.title}
                  </h2>
                  <span className="font-mono text-muted flex-none text-[11px]">
                    {s.level}
                  </span>
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
                    {s.phrases.length + (s.hear?.length ?? 0)} Sätze · antippen
                    zum Hören
                  </summary>
                  <div className="border-line-sub mt-3 border-t pt-3">
                    <p className="font-mono text-muted mb-2 text-[10.5px] tracking-[0.14em] uppercase">
                      Das sagst du
                    </p>
                    <Phrases lines={s.phrases} />

                    {/* The half that was missing. You can rehearse your own
                        lines all week; the appointment still stops dead the
                        moment they ask you something back. */}
                    {s.hear && s.hear.length > 0 && (
                      <>
                        <p className="font-mono text-muted mt-5 mb-2 text-[10.5px] tracking-[0.14em] uppercase">
                          Das hörst du
                        </p>
                        <Phrases lines={s.hear} slow />
                      </>
                    )}
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
          The roleplay follows the same rule as everywhere else: the other
          person only uses words you already know. A real Amt does not — which
          is what the phrase lists above are for.
        </p>
      </>
    </Page>
  );
}
