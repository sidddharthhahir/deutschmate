import Page from "@/components/Page";
import { activeUser } from "@/lib/user";
import { examHistory, type SectionScore } from "@/lib/exam";
import ExamRunner from "./ExamRunner";

export const dynamic = "force-dynamic";

/**
 * Übungstest.
 *
 * The only screen in the app that runs long, silent and timed. Everything else
 * corrects you within two seconds, which is right for learning and tells you
 * nothing about what you can hold together for half an hour.
 *
 * It is scrupulously not called a Modellsatz. The official Goethe Modellsätze
 * are free PDFs from the Goethe-Institut and they are the real answer to "am I
 * B1 yet"; this is built from the app's own content and says so on the results
 * screen, where a number would otherwise be mistaken for a verdict.
 */
export default async function ExamPage() {
  const user = await activeUser();
  const history = examHistory(user.id, 8);

  return (
    <Page
      back="/ueben"
      backLabel="Üben"
      title="Übungstest"
      lead="Four sections, half an hour, no feedback until the end. Built from this app's own content — it shows you which of the four skills lags behind, but it predicts nothing about the real exam."
    >
      <>
        <ExamRunner level={user.level} />

        {history.length > 0 && (
          <section className="border-line-sub mt-12 border-t pt-6">
            <h2 className="font-mono text-muted mb-4 text-[11.5px] tracking-[0.14em] uppercase">
              Bisherige Tests · {history.length}
            </h2>
            <div className="space-y-2">
              {history.map((h) => {
                let sections: SectionScore[] = [];
                try {
                  sections = JSON.parse(h.sections_json);
                } catch {
                  /* a malformed row still shows its total */
                }
                return (
                  <div
                    key={h.id}
                    className="border-line-sub flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl border px-4 py-3"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="font-serif text-[19px] tabular-nums">
                        {h.correct}
                        <span className="text-muted text-[14px]">/{h.total}</span>
                      </span>
                      <span className="font-mono text-muted text-[11.5px]">
                        {h.level} · {h.created_at.slice(0, 10)} · {h.minutes} min
                      </span>
                    </div>
                    <span className="font-mono text-muted text-[11.5px]">
                      {sections.map((s) => `${s.title} ${s.correct}/${s.total}`).join(" · ")}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="border-line-sub mt-10 border-t pt-6">
          <h2 className="font-mono text-muted mb-3 text-[11.5px] tracking-[0.14em] uppercase">
            Die echten Modellsätze
          </h2>
          <p className="text-secondary max-w-[62ch] text-[14px] leading-relaxed">
            The Goethe-Institut publishes a complete Modellsatz for every level as a free
            PDF, with audio and an answer key. If you want to know whether you would pass,
            that is the test — not this one.
          </p>
          <a
            href="https://www.goethe.de/de/spr/kup/prf.html"
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent mt-3 inline-block text-[14px] hover:underline"
          >
            goethe.de → Prüfungen ↗
          </a>
        </section>
      </>
    </Page>
  );
}
