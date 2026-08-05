import Link from "next/link";
import { all, get } from "@/lib/db";
import { requireUser } from "@/lib/user";
import { dueCount } from "@/lib/srs";
import { leechCount } from "@/lib/leech";
import { clozeDueCount, clozeTotal } from "@/lib/cloze";
import { grammarDueCount, grammarStats } from "@/lib/grammar-srs";
import { lastExam } from "@/lib/exam";
import { LEVELS } from "@/lib/session";
import Page, { Section, Tile } from "@/components/Page";
import PendingTexts from "./PendingTexts";
import { plural } from "@/lib/plural";
import { survivalScenarios } from "@/lib/survival";

export const dynamic = "force-dynamic";

/** Üben — free practice. */
export default async function PracticePage() {
  const user = await requireUser();
  // SQLite stores `due` as "YYYY-MM-DD HH:MM:SS", so compare like for like.
  const nowIso = new Date().toISOString().slice(0, 19).replace("T", " ");

  const units = all<{
    id: string;
    ord: number;
    level: string;
    title: string;
    scenario_json: string | null;
  }>(
    "SELECT id, ord, level, title, scenario_json FROM unit WHERE scenario_json IS NOT NULL ORDER BY level, ord",
  );

  const grammar = all<{
    id: string;
    slug: string;
    title: string;
    level: string;
  }>("SELECT id, slug, title, level FROM grammar ORDER BY ord");

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

  /* Which conversations have actually happened. The chat route logs a
     `conversation` attempt per correction, and the runner posts the unit id —
     so this is a record of talking, not of clicking the link. */
  const talked = new Set(
    all<{ ref_id: string }>(
      `SELECT DISTINCT ref_id FROM attempt
        WHERE user_id = ? AND kind = 'conversation' AND ref_id IS NOT NULL`,
      user.id,
    ).map((r) => r.ref_id),
  );
  const talkedCount = units.filter((u) => talked.has(u.id)).length;

  // Levels at or below the learner's own open by default; the rest fold away.
  const here = LEVELS.indexOf(user.level as (typeof LEVELS)[number]);
  const reached = new Set<string>(
    LEVELS.filter((_, i) => here < 0 || i <= here),
  );

  /* Per-rule state, from the same cards the session schedules. */
  const gramState = new Map(
    all<{ ref_id: string; reps: number; state: number; due: string }>(
      `SELECT ref_id, reps, state, due FROM card
        WHERE user_id = ? AND ref_type = 'grammar'`,
      user.id,
    ).map((c) => [c.ref_id, c] as const),
  );

  return (
    <Page
      width="wide"
      title="Üben"
      lead="The daily session decides for you — here you decide."
    >
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          <Tile
            href="/session"
            title="Wiederholen"
            sub={
              due ? `${plural(due, "Karte", "Karten")} fällig` : "nichts fällig"
            }
          />
          <Tile
            href="/wortschatz"
            title="Wortschatz lesen"
            sub="alle Wörter durchblättern"
          />
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
              sub={`${survivalScenarios().length} Termine · Bürgeramt, Arzt, Handwerker …`}
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
            {gapsAll} {gapsAll === 1 ? "Lückensatz" : "Lückensätze"} aus deinen
            eigenen Fehlern und Lesetexten
            {gapsDue > 0 && ` · ${gapsDue} heute fällig`} — kommen automatisch
            in der Sitzung.
          </p>
        )}

        {/* Was a count and a promise. Nothing in the app called the endpoint
            that would have kept it, so the pile only grew. */}
        <PendingTexts initial={pending} />

        {/* 120 rows, all of them looking identical, was the single biggest
            wall in the app. Two changes: each says whether you have actually
            had that conversation, and levels you have not reached start
            folded. Folded, not hidden — this is the page where you decide, so
            nothing is withheld, it just is not all shouting at once. */}
        <Section title={`Szenarien · ${units.length}`}>
          <p className="text-muted mb-4 text-[12.5px]">
            Jedes Gespräch aus allen Units — jederzeit wiederholbar.
            {talkedCount > 0 && ` ${talkedCount} schon geführt.`}
          </p>
          <div className="space-y-2">
            {levels.map((lv) => {
              const mine = units.filter((u) => u.level === lv);
              const talkedHere = mine.filter((u) => talked.has(u.id)).length;
              return (
                <details key={lv} open={reached.has(lv)} className="group">
                  <summary className="border-line-sub hover:border-line flex cursor-pointer items-baseline justify-between rounded-lg border px-4 py-2.5 transition-colors">
                    <span className="font-mono text-secondary text-[12px] tracking-[0.14em] uppercase">
                      {lv}
                      {lv === user.level && (
                        <span className="text-accent"> · hier</span>
                      )}
                    </span>
                    <span className="font-mono text-muted text-[11.5px] tabular-nums">
                      {talkedHere} / {mine.length} geführt
                    </span>
                  </summary>

                  <div className="border-line divide-line-sub mt-2 mb-4 divide-y rounded-[14px] border">
                    {mine.map((u) => {
                      const s = JSON.parse(u.scenario_json!) as {
                        role: string;
                        goal: string;
                      };
                      const doneIt = talked.has(u.id);
                      return (
                        <Link
                          key={u.id}
                          href={`/szenario/${u.id}`}
                          className="hover:bg-raised block px-4 py-3 transition-colors"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="font-serif text-[18px]">
                              {doneIt && (
                                <span className="text-accent mr-2 text-[14px]">
                                  ✓
                                </span>
                              )}
                              {u.title}
                            </span>
                            <span className="font-mono text-muted flex-none text-[11px]">
                              Unit {u.ord}
                            </span>
                          </div>
                          <p className="text-secondary mt-0.5 text-[14px]">
                            {s.goal}
                          </p>
                          <p className="text-muted/70 mt-0.5 text-[12px]">
                            mit: {s.role}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                </details>
              );
            })}
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
            {grammar.map((g) => {
              const c = gramState.get(g.id);
              const solid = c ? c.reps >= 3 && c.state === 2 : false;
              const due = c ? c.due <= nowIso : false;
              return (
                <Link
                  key={g.id}
                  href={`/grammatik/${g.slug}`}
                  title={
                    !c
                      ? "noch nicht eingeführt"
                      : due
                        ? "heute fällig"
                        : solid
                          ? "sitzt"
                          : "eingeführt, noch nicht fest"
                  }
                  /* Three states you can see at a glance, from the same cards
                     the session schedules. A rule that is due back is the one
                     worth reading now, and it used to look exactly like the
                     thirty-five others. */
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
                    due
                      ? "border-accent/60 text-fg hover:border-accent"
                      : solid
                        ? "border-line text-fg hover:border-line-strong"
                        : c
                          ? "border-line-sub text-secondary hover:border-line hover:text-fg"
                          : "border-line-sub text-muted hover:border-line hover:text-secondary"
                  }`}
                >
                  {due && <span className="text-accent mr-1.5">•</span>}
                  {g.title}
                  <span className="font-mono text-muted ml-2 text-[10px]">
                    {g.level}
                  </span>
                </Link>
              );
            })}
          </div>
          <p className="text-muted mt-3 text-[11.5px]">
            Punkt = heute fällig · kräftig = sitzt · blass = noch nicht
            eingeführt
          </p>
        </Section>
      </>
    </Page>
  );
}
