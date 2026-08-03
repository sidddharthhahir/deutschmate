import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { currentUser } from "@/lib/user";
import { LEECH_THRESHOLD, leeches } from "@/lib/leech";
import LeechList from "./LeechList";

export const dynamic = "force-dynamic";

/**
 * Problemwörter.
 *
 * The page the app owed you. FSRS will schedule a word you have forgotten
 * fifteen times forever, without ever saying that something has gone wrong —
 * and grinding those same words is the specific experience that makes people
 * abandon spaced repetition.
 *
 * Not a new nav target: the header stays at four. This is reached from Üben and
 * from Fortschritt, which are the two places you'd go looking for it.
 */
export default async function LeechPage() {
  const user = currentUser("sid");
  const rows = leeches(user.id);
  const active = rows.filter((r) => r.suspended === 0).length;

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
          Problemwörter
        </h1>
        <p className="text-secondary mt-3 max-w-[62ch] text-[15px] leading-relaxed">
          {active > 0 ? (
            <>
              {active} {active === 1 ? "Wort kämpft" : "Wörter kämpfen"} gegen dich — jedes
              davon hast du mindestens {LEECH_THRESHOLD}-mal wieder vergessen. Öfter
              wiederholen hilft hier nicht mehr; das ist genau das, was du schon tust.
            </>
          ) : (
            <>Wörter, die du mindestens {LEECH_THRESHOLD}-mal wieder vergessen hast.</>
          )}
        </p>

        <div className="mt-8">
          <LeechList initial={rows} threshold={LEECH_THRESHOLD} />
        </div>

        {rows.length > 0 && (
          <div className="border-line-sub text-muted mt-10 space-y-2 border-t pt-6 text-[13px] leading-relaxed">
            <p>
              <span className="text-secondary">Im Satz üben</span> — macht aus dem
              Beispielsatz eine Lücke. Ein Wort ohne Kontext ist der häufigste Grund, warum
              es nicht hängen bleibt.
            </p>
            <p>
              <span className="text-secondary">Neu anfangen</span> — setzt die Karte zurück,
              als hättest du das Wort nie gesehen. Der Fehlerzähler bleibt stehen: er ist
              die Geschichte des Wortes, nicht sein Punktestand.
            </p>
            <p>
              <span className="text-secondary">Pausieren</span> — nimmt es aus dem Deck. Kein
              Fortschritt geht verloren, es kommt nur nicht mehr, bis du es zurückholst.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
