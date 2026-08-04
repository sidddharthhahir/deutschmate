import Link from "next/link";
import { requireUser } from "@/lib/user";
import { currentUnit, paceProjection, LEVELS } from "@/lib/session";
import { roadmap, skillsEarned, milestones, dayIndex } from "@/lib/journey";
import { get } from "@/lib/db";
import Page, { Section, Empty } from "@/components/Page";

export const dynamic = "force-dynamic";

/**
 * Der Weg — the whole course on one page, behind and ahead.
 *
 * Fortschritt is this month: counts, accuracy, cost. It is the right page for
 * "am I keeping up" and the wrong one for "am I getting anywhere", because a
 * 30-day window cannot show a six-month arc. This page is the arc.
 *
 * Three questions, in the order people ask them:
 *   Wo stehe ich   — the 120 units, done / here / ahead
 *   Das kannst du  — what those finished units mean in plain terms
 *   Meilensteine   — the dated events, oldest first
 *
 * Not linked from the header. The header has four links on purpose, and a
 * fifth would start turning Home into a menu; this hangs off Fortschritt and
 * the command palette, which is where people go looking for it.
 */

const DATE = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function niceDate(iso: string) {
  const t = Date.parse(`${iso}T12:00:00Z`);
  return Number.isFinite(t) ? DATE.format(new Date(t)) : iso;
}

export default async function WegPage() {
  const user = await requireUser();
  const here = currentUnit(user.id, user.level);
  const levels = roadmap(user.id, here?.id ?? null);
  const skills = skillsEarned(user.id);
  const marks = milestones(user.id);
  const pace = paceProjection(user.id);

  const doneUnits = levels.reduce((a, l) => a + l.done, 0);
  const masteredUnits = levels.reduce((a, l) => a + l.mastered, 0);
  const totalUnits = levels.reduce((a, l) => a + l.total, 0);
  const firstDay = marks[0]?.on ?? null;

  /* Group the can-do statements by level, dropping repeats. Two units can teach
     the same thing — "say when something happens" appears in both the clock
     unit and the appointments unit — and listing it twice reads as padding
     rather than as the two lessons it actually was. */
  const byLevel = LEVELS.map((lv) => {
    const seen = new Set<string>();
    for (const s of skills) {
      if (s.level !== lv) continue;
      for (const item of s.items) seen.add(item);
    }
    return [lv, [...seen]] as const;
  }).filter(([, items]) => items.length > 0);
  const skillCount = byLevel.reduce((a, [, items]) => a + items.length, 0);

  const known =
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM card
        WHERE user_id = ? AND ref_type = 'word' AND reps > 0`,
      user.id,
    )?.n ?? 0;
  const deck = get<{ n: number }>("SELECT COUNT(*) AS n FROM word")?.n ?? 0;

  return (
    <Page
      width="wide"
      back="/fortschritt"
      backLabel="Fortschritt"
      title="Der Weg"
      lead={
        doneUnits === 0
          ? "Noch nichts abgeschlossen. Diese Seite füllt sich von selbst, sobald die erste Unit fertig ist — hier steht nur, was wirklich passiert ist."
          : `${doneUnits} von ${totalUnits} Units hinter dir, davon ${masteredUnits} wirklich sitzend. ${known} von ${deck} Wörtern im Deck.`
      }
      aside={
        <span className="font-mono text-muted text-[12.5px]">
          {user.level}
          {here ? ` · Unit ${here.ord}` : ""}
        </span>
      }
    >
      {/* -------------------------------------------------------- roadmap */}
      <Section
        title="Wo du stehst"
        note={
          pace
            ? `bei diesem Tempo fertig um den ${niceDate(pace.finish)}`
            : "Tempo wird ab drei fertigen Units geschätzt"
        }
      >
        <div className="flex flex-col gap-5">
          {levels.map((l) => {
            const isHere = l.units.some((u) => u.current);
            return (
              <div key={l.level} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span
                    className={`font-mono text-[13px] ${
                      isHere ? "text-fg" : l.finishedAt ? "text-secondary" : "text-muted"
                    }`}
                  >
                    {l.level}
                    {isHere && <span className="text-accent"> · hier</span>}
                  </span>
                  <span className="font-mono text-muted text-[12px] tabular-nums">
                    {l.done} / {l.total}
                    {/* Finished and retained are different claims, so they are
                        two numbers. A level you walked through and a level you
                        can still use are not the same thing. */}
                    {l.done > 0 && <span className="text-der"> · {l.mastered} sitzen</span>}
                    {l.finishedAt && ` · fertig ${niceDate(l.finishedAt)}`}
                  </span>
                </div>

                {/* One tick per unit. Hover names it — this is a map, not a
                    menu, so nothing here navigates. */}
                <div className="flex gap-[3px]">
                  {l.units.map((u) => (
                    <span
                      key={u.id}
                      title={
                        `Unit ${u.ord} · ${u.title}` +
                        (u.done ? ` — ${u.pct}% der Wörter sitzen` : "")
                      }
                      /* Three states, not two. A finished unit whose words
                         have drained away is drawn faintly rather than as a
                         win — the bar should not say "done" about something
                         you can no longer do. */
                      className={`h-[10px] flex-1 rounded-[2px] ${
                        u.current
                          ? "bg-accent"
                          : u.mastered
                            ? "bg-der"
                            : u.done
                              ? "bg-der/35"
                              : "bg-line"
                      }`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-muted mt-5 max-w-[62ch] text-[12.5px] leading-relaxed">
          Ein Strich ist eine Unit. Kräftig heißt: durch <em>und</em> mindestens
          80&nbsp;% der Wörter sitzen wirklich. Blass heißt: durch, aber wieder
          weggerutscht — die Wörter kommen von selbst zurück, du musst nichts
          tun. Orange ist die von heute. Die Reihenfolge liegt fest, und das ist
          Absicht.
        </p>
      </Section>

      {/* --------------------------------------------------------- skills */}
      <Section title="Das kannst du jetzt" note={`${skillCount} Dinge`}>
        {skills.length === 0 ? (
          <Empty title="Noch keine abgeschlossene Unit">
            <p className="text-muted text-[14px] leading-relaxed">
              Hier steht später, was du konkret kannst — „nach dem Preis fragen“,
              „sagen, wo du wohnst“ — und nicht, wie viele Karten du angeklickt
              hast.
            </p>
          </Empty>
        ) : (
          <div className="flex flex-col gap-6">
            {byLevel.map(([lv, items]) => (
              <div key={lv}>
                <div className="font-mono text-muted mb-2 text-[11.5px]">
                  {lv} · {items.length}
                </div>
                <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
                  {items.map((item) => (
                    <div key={item} className="flex items-start gap-2.5">
                      <span className="text-accent mt-[3px] flex-none text-[14px]">✓</span>
                      <span className="text-[15px] leading-[1.45]">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ----------------------------------------------------- milestones */}
      <Section title="Meilensteine" note={marks.length ? `${marks.length} Einträge` : undefined}>
        {marks.length === 0 ? (
          <Empty
            title="Noch nichts zu erzählen"
            action={{ href: "/session", label: "Erste Sitzung starten" }}
          >
            <p className="text-muted text-[14px] leading-relaxed">
              Der erste Eintrag entsteht mit der ersten Sitzung. Danach schreibt
              sich diese Liste allein.
            </p>
          </Empty>
        ) : (
          <ol className="border-line-sub flex flex-col border-l pl-5">
            {marks.map((m, i) => (
              <li key={`${m.on}-${m.title}-${i}`} className="relative pb-5 last:pb-0">
                <span className="bg-line-strong absolute top-[7px] -left-[23px] h-[7px] w-[7px] rounded-full" />
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-serif text-[17px] font-medium">{m.title}</span>
                  <span className="text-muted text-[13.5px]">{m.detail}</span>
                </div>
                <div className="font-mono text-muted mt-0.5 text-[12px]">
                  {niceDate(m.on)}
                  {firstDay && m.on !== firstDay && ` · Tag ${dayIndex(firstDay, m.on)}`}
                </div>
              </li>
            ))}
          </ol>
        )}

        <p className="text-muted mt-6 max-w-[62ch] text-[12.5px] leading-relaxed">
          Jeder Eintrag hat ein Datum, weil er einem echten Ereignis entspricht —
          einer fertigen Unit, einem eingeführten Wort, einem geschriebenen Text.
          Es gibt keine Abzeichen fürs Erscheinen.
        </p>
      </Section>

      <div className="border-line-sub mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t pt-6">
        <Link
          href="/fortschritt"
          className="font-mono text-muted hover:text-fg text-[12.5px] transition-colors"
        >
          Fortschritt · die letzten 30 Tage
        </Link>
        <Link
          href="/woche"
          className="font-mono text-muted hover:text-fg text-[12.5px] transition-colors"
        >
          Woche · was diese Woche passiert ist
        </Link>
      </div>
    </Page>
  );
}
