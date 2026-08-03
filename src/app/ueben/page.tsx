import Link from "next/link";
import { all, get } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { dueCount } from "@/lib/srs";
import { leechCount } from "@/lib/leech";
import { clozeDueCount, clozeTotal } from "@/lib/cloze";
import { grammarDueCount, grammarStats } from "@/lib/grammar-srs";
import { lastExam } from "@/lib/exam";
import AppHeader from "@/components/AppHeader";

export const dynamic = "force-dynamic";

/**
 * Üben — free practice.
 *
 * The Szenarien list here is what replaced a proposed sixth "Real Life" tab:
 * same access to every roleplay in the course, no new navigation target, and
 * the home screen keeps its single button.
 */
export default async function PracticePage() {
  const user = currentUser("sid");

  const units = all<{
    id: string;
    ord: number;
    level: string;
    title: string;
    scenario_json: string | null;
  }>(
    "SELECT id, ord, level, title, scenario_json FROM unit WHERE scenario_json IS NOT NULL ORDER BY level, ord",
  );

  const grammar = all<{ id: string; slug: string; title: string; level: string }>(
    "SELECT id, slug, title, level FROM grammar ORDER BY ord",
  );

  const due = dueCount(user.id);
  const leeches = leechCount(user.id);
  const gapsDue = clozeDueCount(user.id);
  const gapsAll = clozeTotal(user.id);
  const exam = lastExam(user.id);
  const gramDue = grammarDueCount(user.id);
  const gram = grammarStats(user.id);
  const pending =
    get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM pending_correction WHERE user_id=? AND resolved_at IS NULL",
      user.id,
    )?.n ?? 0;

  const levels = [...new Set(units.map((u) => u.level))];

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[880px] flex-1 px-6 py-10 md:px-10">
        <h1 className="font-serif text-[32px] font-semibold tracking-[-0.015em]">Üben</h1>
        <p className="text-muted mt-2 max-w-[58ch] text-[15px] leading-relaxed">
          Die tägliche Sitzung entscheidet für dich — hier entscheidest du.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Tile
            href="/session"
            title="Wiederholen"
            sub={due ? `${due} Karten fällig` : "nichts fällig"}
          />
          <Tile href="/wortschatz" title="Wortschatz lesen" sub="alle Wörter durchblättern" />
          <Tile
            href="/pruefung"
            title="Übungstest"
            sub={
              exam
                ? `zuletzt ${exam.correct} von ${exam.total} · ${exam.created_at.slice(0, 10)}`
                : "30 Fragen · 30 Minuten · getaktet"
            }
          />
          <Tile
            href="/problemwoerter"
            title="Problemwörter"
            sub={
              leeches
                ? `${leeches} ${leeches === 1 ? "Wort kämpft" : "Wörter kämpfen"} gegen dich`
                : "keine — nichts hakt gerade"
            }
            flag={leeches > 0}
          />
        </div>

        {/* Everything below is German that isn't the course: your own texts,
            today's news, the appointments you can't avoid. */}
        <Section title="Echtes Deutsch">
          <div className="grid gap-3 sm:grid-cols-2">
            <Tile
              href="/text"
              title="Dein Text"
              sub="einfügen → was kennst du schon?"
            />
            <Tile
              href="/nachrichten"
              title="Nachrichten"
              sub="langsam gesprochen · täglich neu"
            />
            <Tile
              href="/alltag"
              title="Alltag"
              sub="Bürgeramt, WG, Arzt, Bank"
            />
            <Tile
              href="/unterwegs"
              title="Unterwegs"
              sub="freihändig hören beim Laufen"
            />
          </div>
        </Section>

        <Section title="Aussprache">
          <div className="grid gap-3 sm:grid-cols-2">
            <Tile
              href="/aussprache"
              title="Minimalpaare"
              sub="schon / schön · Kiste / Küste"
            />
          </div>
        </Section>

        {gapsAll > 0 && (
          <p className="text-muted mt-4 text-[13px]">
            {gapsAll} {gapsAll === 1 ? "Lückensatz" : "Lückensätze"} aus deinen eigenen
            Fehlern und Lesetexten
            {gapsDue > 0 && ` · ${gapsDue} heute fällig`} — kommen automatisch in der
            Sitzung.
          </p>
        )}

        {pending > 0 && (
          <div className="border-line-sub bg-raised mt-4 rounded-xl border p-4">
            <p className="text-accent/90 text-[14px]">
              {pending} {pending === 1 ? "Text wartet" : "Texte warten"} auf Korrektur
            </p>
            <p className="text-muted mt-1 text-[12.5px]">
              Offline geschrieben — wird beim nächsten Online-Start automatisch geprüft.
            </p>
          </div>
        )}

        <Section title={`Szenarien · ${units.length}`}>
          <p className="text-muted mb-4 text-[12.5px]">
            Jedes Gespräch aus allen Units — jederzeit wiederholbar.
          </p>
          <div className="space-y-6">
            {levels.map((lv) => (
              <div key={lv}>
                <p className="font-mono text-muted mb-2 text-[11px] tracking-[0.14em] uppercase">
                  {lv}
                </p>
                <div className="border-line divide-line-sub divide-y rounded-[14px] border">
                  {units
                    .filter((u) => u.level === lv)
                    .map((u) => {
                      const s = JSON.parse(u.scenario_json!) as { role: string; goal: string };
                      return (
                        <Link
                          key={u.id}
                          href={`/szenario/${u.id}`}
                          className="hover:bg-raised block px-4 py-3 transition-colors"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="font-serif text-[18px]">{u.title}</span>
                            <span className="font-mono text-muted flex-none text-[11px]">
                              Unit {u.ord}
                            </span>
                          </div>
                          <p className="text-secondary mt-0.5 text-[14px]">{s.goal}</p>
                          <p className="text-muted/70 mt-0.5 text-[12px]">mit: {s.role}</p>
                        </Link>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={`Grammatik nachschlagen · ${grammar.length}`}>
          {/* Which rules are actually in rotation, and which are due back —
              the same honesty the vocabulary counts get. */}
          <p className="text-muted mb-4 text-[12.5px]">
            {gram.inDeck > 0
              ? `${gram.inDeck} eingeführt · ${gram.solid} sitzen fest${
                  gramDue > 0 ? ` · ${gramDue} heute fällig` : ""
                }`
              : "Noch keine Regel eingeführt — sie kommen mit den Units."}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {grammar.map((g) => (
              <Link
                key={g.id}
                href={`/grammatik/${g.slug}`}
                className="border-line text-secondary hover:border-line-strong hover:text-fg rounded-full border px-3.5 py-1.5 text-[13px] transition-colors"
              >
                {g.title}
                <span className="font-mono text-muted ml-2 text-[10px]">{g.level}</span>
              </Link>
            ))}
          </div>
        </Section>
      </div>
    </main>
  );
}

function Tile({
  href,
  title,
  sub,
  flag,
}: {
  href: string;
  title: string;
  sub: string;
  /** Marks a tile that has something waiting. A dot, never a red badge count. */
  flag?: boolean;
}) {
  return (
    <Link
      href={href}
      className="border-line hover:border-line-strong hover:bg-raised rounded-[14px] border p-5 transition-colors"
    >
      <p className="font-serif flex items-center gap-2 text-[20px] font-medium">
        {title}
        {flag && <span className="bg-accent h-[6px] w-[6px] rounded-full" />}
      </p>
      <p className="font-mono text-muted mt-1 text-[12.5px]">{sub}</p>
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-line-sub mt-10 border-t pt-6">
      <h2 className="font-mono text-muted mb-4 text-[11.5px] tracking-[0.14em] uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
