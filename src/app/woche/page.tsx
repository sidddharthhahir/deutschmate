import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { all, get } from "@/lib/db";
import { activeUser } from "@/lib/user";
import { de } from "@/lib/tags";
import { plural, word } from "@/lib/plural";

export const dynamic = "force-dynamic";

/**
 * Diese Woche — the reflective counterpart to the daily recap.
 *
 * The recap answers "how did today go" in the ninety seconds after a session.
 * Nothing answered "is this working", which is the question that decides
 * whether you're still here in month four.
 *
 * Everything is a count or a difference between two counts. The one piece of
 * interpretation — which mistake improved most — is a subtraction between two
 * seven-day windows, and the page shows both numbers so you can see the
 * subtraction rather than trust it.
 */

const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

type Row = { tag: string; now: number; before: number };

export default async function WeekPage() {
  const user = await activeUser();
  const n = (sql: string, ...p: unknown[]) => get<{ n: number }>(sql, ...p)?.n ?? 0;

  // ---------------------------------------------------------------- the week
  const days = all<{ date: string; minutes: number }>(
    `SELECT date, minutes FROM session_log
      WHERE user_id = ? AND date > date('now','-7 days')
      ORDER BY date`,
    user.id,
  );
  const minutes = days.reduce((a, d) => a + d.minutes, 0);
  const sessions = days.length;

  const prevMinutes =
    get<{ n: number }>(
      `SELECT COALESCE(SUM(minutes),0) AS n FROM session_log
        WHERE user_id = ? AND date <= date('now','-7 days') AND date > date('now','-14 days')`,
      user.id,
    )?.n ?? 0;

  const newWords = n(
    `SELECT COUNT(*) AS n FROM attempt
      WHERE user_id = ? AND kind='new-vocab' AND created_at > datetime('now','-7 days')`,
    user.id,
  );
  const reviews = n(
    `SELECT COUNT(*) AS n FROM attempt
      WHERE user_id = ? AND kind='review' AND created_at > datetime('now','-7 days')`,
    user.id,
  );
  const acc = get<{ t: number; c: number }>(
    `SELECT COUNT(*) AS t, COALESCE(SUM(correct),0) AS c FROM attempt
      WHERE user_id = ? AND created_at > datetime('now','-7 days')`,
    user.id,
  );
  const accuracy = acc?.t ? Math.round((acc.c / acc.t) * 100) : null;

  // ------------------------------------------------------- what moved, by tag
  const tally = (from: string, to: string) => {
    const rows = all<{ tags: string }>(
      `SELECT error_tags_json AS tags FROM attempt
        WHERE user_id = ? AND correct = 0
          AND created_at > datetime('now', ?) AND created_at <= datetime('now', ?)`,
      user.id,
      from,
      to,
    );
    const m = new Map<string, number>();
    for (const r of rows) {
      try {
        for (const t of JSON.parse(r.tags) as string[]) m.set(t, (m.get(t) ?? 0) + 1);
      } catch {
        /* a malformed row just doesn't count */
      }
    }
    return m;
  };

  const now = tally("-7 days", "-0 days");
  const before = tally("-14 days", "-7 days");

  /* The keys come from the union of both weeks, so every row already has a
     count on at least one side — the filter that used to sit here,
     `before > 0 || now > 0`, was always true, and its comment claimed the
     opposite ("history on both sides"). Rather than tighten it to && and lose
     brand-new problems entirely, the two directions are separated: a tag with
     no history last week has not become more frequent, it has appeared, and
     TagRows says "neu" for it instead of rendering "0× → 3×" as a trend. */
  const moved: Row[] = [...new Set([...now.keys(), ...before.keys()])]
    .map((tag) => ({ tag, now: now.get(tag) ?? 0, before: before.get(tag) ?? 0 }))
    .sort((a, b) => a.now - a.before - (b.now - b.before));

  const better = moved.filter((r) => r.before > 0 && r.now < r.before).slice(0, 3);
  const worse = moved.filter((r) => r.before > 0 && r.now > r.before).reverse().slice(0, 3);
  const fresh = moved.filter((r) => r.before === 0 && r.now > 0).slice(0, 3);

  const empty = sessions === 0 && reviews === 0;

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[760px] flex-1 px-6 py-10 md:px-10">
        <h1 className="font-serif text-[32px] font-semibold tracking-[-0.015em]">
          Diese Woche
        </h1>
        <p className="text-muted mt-2 text-[13px]">The last 7 days, counted.</p>

        {empty ? (
          <p className="text-secondary mt-10 max-w-[52ch] text-[15px] leading-relaxed">
            Noch nichts zu zeigen. Diese Seite füllt sich nach der ersten
            abgeschlossenen Sitzung — sie erfindet keine Zahlen, um schon jetzt
            nach etwas auszusehen.
          </p>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4">
              {/* The label sits under the number and still has to agree with
                  it — "1 Sitzungen" is wrong German on a German-teaching app,
                  layout notwithstanding. */}
              <Stat
                n={minutes}
                label={word(minutes, "Minute", "Minuten")}
                sub={delta(minutes, prevMinutes, "min")}
              />
              <Stat
                n={sessions}
                label={word(sessions, "Sitzung", "Sitzungen")}
                sub="von 7 Tagen"
              />
              <Stat
                n={newWords}
                label={word(newWords, "Neues Wort", "Neue Wörter")}
                sub={plural(reviews, "Wiederholung", "Wiederholungen")}
              />
              <Stat
                n={accuracy}
                label="Richtig"
                suffix="%"
                sub={acc?.t ? plural(acc.t, "Antwort", "Antworten") : "—"}
              />
            </div>

            {/* Which days you actually showed up. Seven cells, no judgement. */}
            <section className="border-line-sub mt-10 border-t pt-6">
              <h2 className="font-mono text-muted mb-4 text-[11.5px] tracking-[0.14em] uppercase">
                Tage
              </h2>
              <div className="flex gap-1.5">
                {lastSevenDays().map((d) => {
                  const hit = days.find((x) => x.date === d.iso);
                  return (
                    <div key={d.iso} className="flex flex-1 flex-col items-center gap-1.5">
                      <div
                        title={hit ? `${d.iso}: ${hit.minutes} min` : `${d.iso}: nichts`}
                        className={`h-12 w-full rounded-[3px] ${
                          hit ? "bg-accent" : "bg-line"
                        }`}
                        style={
                          hit
                            ? { opacity: 0.35 + Math.min(0.65, hit.minutes / 90) }
                            : undefined
                        }
                      />
                      <span className="font-mono text-muted text-[10.5px]">{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {(better.length > 0 || worse.length > 0) && (
              <section className="border-line-sub mt-10 border-t pt-6">
                <h2 className="font-mono text-muted mb-4 text-[11.5px] tracking-[0.14em] uppercase">
                  Verglichen mit der Woche davor
                </h2>

                {better.length > 0 && (
                  <div className="mb-5">
                    <p className="text-accent mb-2 text-[13px]">Seltener geworden</p>
                    <TagRows rows={better} />
                  </div>
                )}

                {worse.length > 0 && (
                  <div>
                    <p className="text-das mb-2 text-[13px]">Häufiger geworden</p>
                    <TagRows rows={worse} />
                  </div>
                )}

                {fresh.length > 0 && (
                  <div>
                    <p className="text-secondary mb-2 text-[13px]">Neu diese Woche</p>
                    <TagRows rows={fresh} />
                  </div>
                )}

                <p className="text-muted mt-4 max-w-[62ch] text-[12.5px] leading-relaxed">
                  Beide Zahlen stehen da, damit du die Rechnung siehst statt sie zu
                  glauben. Eine Woche ist eine kleine Stichprobe — eine Richtung, kein
                  Urteil.
                </p>
              </section>
            )}
          </>
        )}

        <div className="border-line-sub mt-10 flex flex-wrap gap-4 border-t pt-6">
          <Link href="/fortschritt" className="text-accent text-[13.5px] hover:underline">
            Gesamtfortschritt →
          </Link>
          <Link href="/problemwoerter" className="text-accent text-[13.5px] hover:underline">
            Problemwörter →
          </Link>
        </div>
      </div>
    </main>
  );
}

function lastSevenDays() {
  const out: { iso: string; label: string }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push({ iso: d.toISOString().slice(0, 10), label: DAYS[d.getDay()] });
  }
  return out;
}

function delta(now: number, before: number, unit: string) {
  if (!before) return "erste Woche";
  const d = now - before;
  if (d === 0) return `gleich wie letzte Woche`;
  return `${d > 0 ? "+" : ""}${d} ${unit} zur Vorwoche`;
}

function TagRows({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <Link
          key={r.tag}
          href={`/fehler/${r.tag}`}
          className="hover:bg-raised -mx-3 flex items-baseline justify-between gap-4 rounded-lg px-3 py-1.5 transition-colors"
        >
          <span className="text-secondary text-[14px]">
            {de(r.tag)}
          </span>
          <span className="font-mono text-muted flex-none text-[12.5px] tabular-nums">
            {r.before === 0 ? `neu · ${r.now}×` : `${r.before}× → ${r.now}×`}
          </span>
        </Link>
      ))}
    </div>
  );
}

function Stat({
  n,
  label,
  sub,
  suffix,
}: {
  n: number | null;
  label: string;
  sub?: string;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-serif text-[40px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
        {n === null ? "–" : n}
        {n !== null && suffix && <span className="text-[24px]">{suffix}</span>}
      </span>
      <span className="font-mono text-secondary text-[11px] tracking-[0.08em] uppercase">
        {label}
      </span>
      {sub && <span className="text-muted/70 text-[11px] leading-tight">{sub}</span>}
    </div>
  );
}
