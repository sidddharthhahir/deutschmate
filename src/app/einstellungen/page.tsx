import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { requireUser } from "@/lib/user";
import { keyState, budgetFor } from "@/lib/apikey";
import { budgetCeiling } from "@/lib/env";
import { spendThisMonth } from "@/lib/cost";
import { contributions } from "@/lib/shared-cache";
import KeyForm from "./KeyForm";
import CacheSection from "./CacheSection";
import { TAP } from "@/lib/ui";

export const dynamic = "force-dynamic";

/** Einstellungen — your key, your cap, your spend. */
export default async function SettingsPage() {
  const user = await requireUser();
  const key = keyState(user.id);
  const spend = spendThisMonth(user.id);
  const cap = budgetFor(user.id, budgetCeiling());
  const isDefault = cap === budgetCeiling();

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[620px] flex-1 px-6 py-10 md:px-10">
        <Link
          href="/"
          className={`font-mono text-muted hover:text-secondary text-[12px] transition-colors ${TAP}`}
        >
          ← Startseite
        </Link>

        <h1 className="font-serif mt-4 text-[32px] font-semibold tracking-[-0.015em]">
          Einstellungen
        </h1>
        <p className="text-secondary mt-3 text-[15px] leading-relaxed">
          Der Kurs ist kostenlos und läuft auf diesem Rechner. Vier Dinge
          brauchen ein Modell — und dafür deinen eigenen Schlüssel.
        </p>

        <KeyForm
          state={key}
          spend={spend.dollars}
          cap={cap}
          isDefault={isDefault}
        />

        {/* What the free half is, stated plainly. It is most of the app, and a
            learner deciding whether to bother with a key deserves the real
            list rather than a nag. */}
        <section className="border-line-sub mt-12 border-t pt-6">
          <h2 className="font-mono text-muted mb-4 text-[11.5px] tracking-[0.14em] uppercase">
            Ohne Schlüssel · without a key
          </h2>
          <div className="space-y-2.5 text-[14px]">
            {[
              [
                "Gespräch",
                "läuft als vorbereiteter Dialog statt als freies Gespräch",
              ],
              [
                "Schreibkorrektur",
                "dein Text wird gespeichert und korrigiert, sobald ein Schlüssel da ist",
              ],
              [
                "„Erklär mir das“",
                "aus dem Cache, wenn es jemand schon gefragt hat",
              ],
              ["Eselsbrücken", "nicht verfügbar"],
            ].map(([what, how]) => (
              <div key={what} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-secondary">{what}</span>
                <span className="text-muted text-[12.5px]">— {how}</span>
              </div>
            ))}
          </div>
          <p className="text-muted mt-4 max-w-[56ch] text-[12.5px] leading-relaxed">
            Alles andere kostet nichts und braucht nichts: 2.400 Wörter mit
            Audio, 120 Units, 36 Grammatikpunkte, 38 Lesetexte, Wiederholungen,
            Lücken, Tests, Minimalpaare, Unterwegs — und 955 fertige
            Erklärungen, sodass jede falsche Antwort auch ohne Schlüssel
            begründet wird.
          </p>
        </section>

        <CacheSection initial={contributions(user.id)} />

        <p className="text-muted/70 mt-10 text-[12px] leading-relaxed">
          Dein Schlüssel wird verschlüsselt gespeichert (AES-256-GCM) und nie
          wieder angezeigt — auch dir nicht. Er verlässt diesen Server nur
          Richtung Anthropic.
        </p>
      </div>
    </main>
  );
}
