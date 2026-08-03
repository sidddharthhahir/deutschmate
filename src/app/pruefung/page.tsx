import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { currentUser } from "@/lib/user";
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
  const user = currentUser("sid");
  const history = examHistory(user.id, 8);

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
          Übungstest
        </h1>
        <p className="text-secondary mt-3 max-w-[62ch] text-[15px] leading-relaxed">
          Vier Teile, eine halbe Stunde, keine Rückmeldung bis zum Schluss. Der Test ist aus
          dem Inhalt dieser App gebaut — er zeigt dir, welcher Teil hinterherhinkt, aber er
          ist keine Prognose für die echte Prüfung.
        </p>

        <div className="mt-8">
          <ExamRunner level={user.level} />
        </div>

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
            Das Goethe-Institut veröffentlicht zu jeder Stufe einen vollständigen Modellsatz
            als kostenloses PDF, mit Audio und Lösungsschlüssel. Wenn du wissen willst, ob du
            die Prüfung bestehst, ist das der Test — nicht dieser hier.
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
      </div>
    </main>
  );
}
