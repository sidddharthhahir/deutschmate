import Link from "next/link";
import { all, get } from "@/lib/db";
import { requireUser } from "@/lib/user";
import { topErrorTags } from "@/lib/errors";
import { currentStreak, paceProjection } from "@/lib/session";
import { LEECH_THRESHOLD, leeches } from "@/lib/leech";
import { examHistory, type SectionScore } from "@/lib/exam";
import { grammarStats } from "@/lib/grammar-srs";
import { SOUND_SPELLING } from "@/lib/pairs";
import { plural, is } from "@/lib/plural";
import { de } from "@/lib/tags";
import { spendThisMonth, projectedMonthly, budgetLeft, priceList, isPriced } from "@/lib/cost";
import Noun from "@/components/Article";
import Page, { Section } from "@/components/Page";

export const dynamic = "force-dynamic";

/**
 * Fortschritt.
 *
 * Principle 4 throughout: every number is a COUNT of something the learner did.
 * No estimated CEFR level, no pass probability, no confidence score. The page
 * leads with the four headline counts and then descends in importance, rather
 * than presenting six equal sections.
 */
export default async function ProgressPage() {
  const user = await requireUser();
  const n = (sql: string, ...p: unknown[]) => get<{ n: number }>(sql, ...p)?.n ?? 0;

  const totalWords = n("SELECT COUNT(*) AS n FROM word");
  const inDeck = n(
    "SELECT COUNT(*) AS n FROM card WHERE user_id=? AND ref_type='word' AND reps > 0",
    user.id,
  );
  const learned = n(
    "SELECT COUNT(*) AS n FROM card WHERE user_id=? AND ref_type='word' AND reps >= 3 AND state = 2",
    user.id,
  );
  const mastered = n(
    "SELECT COUNT(*) AS n FROM card WHERE user_id=? AND ref_type='word' AND stability > 30",
    user.id,
  );
  // Distinct words, not page turns — see the word_seen table in schema.sql.
  const seen = n("SELECT COUNT(*) AS n FROM word_seen WHERE user_id=?", user.id);

  const perSkill = all<{ kind: string; n: number; correct: number }>(
    `SELECT kind, COUNT(*) AS n, COALESCE(SUM(correct),0) AS correct
       FROM attempt WHERE user_id = ? GROUP BY kind ORDER BY n DESC`,
    user.id,
  ).filter((s) => !NOT_GRADED.has(s.kind));

  /* Heard in walk mode. Real, worth showing, and not an accuracy — so it is a
     count in a sentence rather than a permanent 100% bar. The route stores the
     number of words per walk in user_answer; this is playbacks, repeats
     included, which is what "gehört" honestly means. */
  const heard = n(
    `SELECT COALESCE(SUM(CAST(user_answer AS INTEGER)), 0) AS n
       FROM attempt WHERE user_id = ? AND kind = 'exposure'`,
    user.id,
  );

  const completed = new Set(
    all<{ unit_id: string }>(
      "SELECT unit_id FROM unit_progress WHERE user_id=? AND status='complete'",
      user.id,
    ).map((r) => r.unit_id),
  );
  const unitsByLevel = all<{ id: string; level: string; ord: number; title: string }>(
    "SELECT id, level, ord, title FROM unit ORDER BY level, ord",
  );

  const tags = topErrorTags(user.id, 30, 6);
  const streak = currentStreak(user.id);

  const days = all<{ date: string; minutes: number }>(
    `SELECT date, minutes FROM session_log
      WHERE user_id = ? AND date > date('now','-30 days') ORDER BY date`,
    user.id,
  );
  const totalMinutes = days.reduce((a, d) => a + d.minutes, 0);
  const sounds = soundBreakdown(user.id);
  const stuck = leeches(user.id, LEECH_THRESHOLD, 8).filter((l) => l.suspended === 0);
  const exams = examHistory(user.id, 5);
  const gram = grammarStats(user.id);
  const pace = paceProjection(user.id);
  const spend = spendThisMonth(user.id);
  const projected = projectedMonthly(user.id);
  const budget = budgetLeft(user.id);
  const prices = priceList();
  /* Calls this app billed for but could not price, because the model is not in
     data/models.json. Zero of them normally; not zero if somebody points their
     own key at a model the catalogue has not caught up with yet. */
  const unpriced = all<{ model: string; calls: number }>(
    `SELECT model, COUNT(*) AS calls FROM usage
      WHERE user_id = ? AND created_at > datetime('now','-30 days')
      GROUP BY model`,
    user.id,
  ).filter((m) => !isPriced(m.model));

  return (
    <Page
      width="wide"
      title="Fortschritt"
      aside={
        <div className="flex items-baseline gap-4">
          {/* Whose numbers these are. On a shared laptop that is not obvious,
              and it used to be impossible to tell or change. */}
          <Link
            href="/wer"
            className="font-mono text-muted hover:text-secondary text-[12.5px] transition-colors"
          >
            {user.name}
          </Link>
          <Link href="/woche" className="text-accent text-[12.5px] hover:underline">
            Diese Woche →
          </Link>
          {streak > 0 && (
            <span className="font-mono text-muted text-[12.5px]">Tag {streak}</span>
          )}
        </div>
      }
    >
      <>
        {/* Headline counts — the four that matter, in serif at size. */}
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat n={seen} label="gesehen" hint="im Wortschatz gelesen" />
          <Stat n={inDeck} label="im Deck" hint="mindestens 1× geübt" />
          {/* The hint said "letzte 2 richtig", which is not what the query
              asks. `state = 2` is the FSRS review state and says nothing about
              the last two answers. */}
          <Stat n={learned} label="gelernt" hint="3+ Wdh. · in Wiederholung" />
          <Stat n={mastered} label="gemeistert" hint="Stabilität > 30 Tage" />
        </div>
        <p className="text-muted mt-4 max-w-[62ch] text-[13px] leading-relaxed">
          „gesehen“ und „gelernt“ sind bewusst getrennt — Lesen ist Wiedererkennen,
          nicht Können.
          {heard > 0 &&
            ` ${heard}× hast du unterwegs ein Wort gehört — auch das ist keins von beidem.`}
        </p>

        <Section title={`Wortschatz — ${learned} von ${totalWords}`}>
          <Bar value={learned} max={totalWords} />
        </Section>

        <Section title={`Grammatik — ${gram.solid} von ${gram.total}`}>
          <Bar value={gram.solid} max={gram.total} />
          <p className="text-muted mt-3 max-w-[62ch] text-[12.5px] leading-relaxed">
            {plural(gram.inDeck, "Regel", "Regeln")} {is(gram.inDeck)} eingeführt und {is(gram.inDeck) === "ist" ? "wird" : "werden"} wiederholt, {gram.solid} davon
            {gram.solid === 1 ? " sitzt" : " sitzen"} (3+ Wiederholungen). Grammatik läuft auf derselben Vergessenskurve wie
            Wörter — eine Regel, die du einmal gesehen hast, ist keine Regel, die du kannst.
          </p>
        </Section>

        {pace && (
          <Section title="Tempo">
            <p className="font-serif text-[19px] leading-relaxed">
              {plural(pace.done, "Unit", "Units")} in {plural(pace.days, "Tag", "Tagen")} — das sind{" "}
              <span className="text-accent">{pace.perWeek} pro Woche</span>. Bei diesem Tempo
              sind die restlichen {pace.remaining} in etwa {plural(pace.weeksLeft, "Woche", "Wochen")}{" "}
              durch,
              also um den{" "}
              <span className="text-accent">
                {new Date(pace.finish).toLocaleDateString("de-DE", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
              .
            </p>
            <p className="text-muted mt-3 max-w-[62ch] text-[12.5px] leading-relaxed">
              Das ist Rechnen mit deinem bisherigen Tempo, keine Aussage über dein Deutsch.
              Es sagt, wann dir der Kurs ausgeht — nicht, dass du dann B1.2 sprichst.
            </p>
          </Section>
        )}

        {/* The 120-unit map used to be drawn here as well. Two copies of the
            same picture is one too many, and this page is the 30-day window —
            the course arc belongs on the page that is about the arc. */}
        <Section title={`Units — ${completed.size} von ${unitsByLevel.length}`}>
          <Bar value={completed.size} max={unitsByLevel.length} />
          <Link
            href="/weg"
            className="border-line hover:border-line-strong hover:bg-raised group mt-4 flex items-center justify-between rounded-[14px] border px-5 py-4 transition-all"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-medium">Der Weg</span>
              <span className="font-mono text-muted text-[12px]">
                alle 120 Units · was du schon kannst · Meilensteine
              </span>
            </span>
            <span className="text-muted group-hover:text-fg transition-colors">→</span>
          </Link>
        </Section>

        {perSkill.length > 0 && (
          <Section title="Genauigkeit nach Übungsart">
            <div className="space-y-3">
              {perSkill.map((s) => (
                <div key={s.kind}>
                  <div className="mb-1 flex justify-between text-[13px]">
                    <span className="text-secondary">{LABELS[s.kind] ?? s.kind}</span>
                    <span className="font-mono text-muted">
                      {Math.round((s.correct / s.n) * 100)}%{" "}
                      <span className="opacity-50">({s.n})</span>
                    </span>
                  </div>
                  <Bar value={s.correct} max={s.n} />
                </div>
              ))}
            </div>
          </Section>
        )}

        {tags.length > 0 && (
          <Section title="Häufigste Fehler · 30 Tage">
            {/* Each tag opens every instance of that mistake — the count on
                its own tells you something is wrong without showing you what. */}
            <div className="space-y-1">
              {tags.map((t) => (
                <Link
                  key={t.tag}
                  href={`/fehler/${t.tag}`}
                  className="hover:bg-raised -mx-3 flex items-baseline justify-between gap-4 rounded-lg px-3 py-1.5 text-[14px] transition-colors"
                >
                  {/* `t.label` is the English description — it exists for the
                      AI brief and for the rule tier of an explanation, and it
                      was being printed here under a German heading beside
                      German bars. */}
                  <span className="text-secondary">{de(t.tag)}</span>
                  <span className="font-mono text-muted flex-none">{t.n}× →</span>
                </Link>
              ))}
            </div>
            <p className="text-muted mt-3 text-[12.5px]">
              Die obersten drei landen morgen automatisch im Fix-Block. Antippen zeigt
              jedes einzelne Beispiel.
            </p>
          </Section>
        )}

        {/* Leeches. The app knows which words are wasting your time; not saying
            so would be the same silence that makes people quit SRS. */}
        {stuck.length > 0 && (
          <Section title={`Problemwörter · ${stuck.length}`}>
            <p className="text-muted mb-4 max-w-[62ch] text-[12.5px] leading-relaxed">
              Mindestens {LEECH_THRESHOLD}-mal wieder vergessen. Häufiger wiederholen hilft
              hier nicht mehr — das passiert ja bereits.
            </p>
            <div className="space-y-2">
              {stuck.map((l) => (
                <div key={l.cardId} className="flex items-baseline justify-between gap-4">
                  <span className="font-serif text-[17px]">
                    <Noun article={l.pos === "noun" ? l.article : null}>{l.lemma}</Noun>
                    <span className="text-muted ml-3 text-[13px]">{l.en}</span>
                  </span>
                  <span className="font-mono text-muted flex-none text-[12px] tabular-nums">
                    {l.lapses}× vergessen
                  </span>
                </div>
              ))}
            </div>
            <Link
              href="/problemwoerter"
              className="text-accent mt-4 inline-block text-[13px] hover:underline"
            >
              Alle ansehen und etwas dagegen tun →
            </Link>
          </Section>
        )}

        {exams.length > 0 && (
          <Section title={`Übungstests · ${exams.length}`}>
            <div className="space-y-2">
              {exams.map((e) => {
                let sections: SectionScore[] = [];
                try {
                  sections = JSON.parse(e.sections_json);
                } catch {
                  /* total still renders */
                }
                return (
                  <div key={e.id} className="flex items-baseline justify-between gap-4">
                    <span className="font-mono text-muted text-[12px]">
                      {e.created_at.slice(0, 10)} · {e.level}
                    </span>
                    <span className="font-mono text-secondary text-[12px] tabular-nums">
                      {sections.map((s) => `${s.title.slice(0, 4)} ${s.correct}/${s.total}`).join(" · ")}
                      <span className="text-fg ml-3">
                        {e.correct}/{e.total}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-muted mt-3 max-w-[62ch] text-[12.5px] leading-relaxed">
              Aus dem Inhalt dieser App gebaut — kein offizieller Modellsatz und keine
              Aussage darüber, ob du die echte Prüfung bestehen würdest.
            </p>
          </Section>
        )}

        {sounds.length > 0 && (
          <Section title="Aussprache">
            <div className="space-y-2">
              {sounds.map((s) => (
                <div key={s.sound} className="flex items-center justify-between text-[14px]">
                  <span className="font-serif text-fg text-[17px]">{s.sound}</span>
                  <span className="font-mono text-muted text-[12.5px]">
                    {s.ok} / {s.total} erkannt
                  </span>
                </div>
              ))}
            </div>
            <p className="text-muted mt-3 max-w-[62ch] text-[12.5px] leading-relaxed">
              Gezählt aus echten Erkennungsergebnissen — kein Aussprache-Score.
            </p>
          </Section>
        )}

        {/* The €10 ceiling, checkable. These are the API's own token counts,
            priced at standard published rates — the figure errs high rather
            than reassuring you with an optimistic one. */}
        <Section title="Kosten · 30 Tage">
          {spend.calls === 0 ? (
            <p className="text-muted text-[14px] leading-relaxed">
              Noch kein einziger Modellaufruf. Alles, was du bisher gemacht hast, lief
              lokal — Wiederholungen, Lücken, Tests und Wortschatz kosten nichts.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                <Stat
                  n={Math.round(spend.dollars * 100)}
                  label="Cent"
                  hint={`in ${spend.calls} Aufrufen`}
                />
                <Stat
                  n={projected === null ? 0 : Math.round(projected * 100)}
                  label="Cent / Monat"
                  hint={projected === null ? "noch zu wenig Daten" : "bei diesem Tempo"}
                />
                <Stat n={spend.cacheShare} label="% aus Cache" hint="kostet 10% des Preises" />
                <Stat
                  n={Math.round((spend.input + spend.output + spend.cacheRead) / 1000)}
                  label="k Tokens"
                  hint="tatsächlich gezählt"
                />
              </div>

              {spend.byKind.length > 0 && (
                <div className="mt-6 space-y-2">
                  {spend.byKind.map((k) => (
                    <div key={k.kind} className="flex justify-between text-[13.5px]">
                      <span className="text-secondary">{COST_LABEL[k.kind] ?? k.kind}</span>
                      <span className="font-mono text-muted tabular-nums">
                        {(k.micros / 10_000).toFixed(2)} ¢
                        <span className="opacity-50"> ({k.calls})</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* The ceiling is enforced, not just displayed: every paid call
                  checks it first and falls back to the offline path when it is
                  gone. Showing the same number the guard uses means the bar and
                  the behaviour can never drift apart. */}
              <div className="mt-6">
                <div className="flex items-baseline justify-between text-[12.5px]">
                  <span className="text-secondary">
                    Budget · {budget.spent.toFixed(2)} $ von {budget.ceiling.toFixed(2)} $
                  </span>
                  <span className="text-muted font-mono tabular-nums">
                    {budget.remaining <= 0
                      ? "aufgebraucht"
                      : `${budget.remaining.toFixed(2)} $ übrig`}
                  </span>
                </div>
                <div className="bg-line mt-2 h-[3px] w-full overflow-hidden rounded-full">
                  <div
                    className={`h-full rounded-full ${
                      budget.remaining <= 0 ? "bg-das" : "bg-der"
                    }`}
                    style={{
                      width: `${Math.min(100, budget.ceiling ? (budget.spent / budget.ceiling) * 100 : 100)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Which price list produced these figures, and whether it could
                  price everything. A total that silently omits a real charge
                  reads exactly like a complete one — and the rates are data
                  now (data/models.json), so the date is a fact worth showing
                  rather than an implementation detail. */}
              <p className="text-muted mt-4 max-w-[62ch] text-[12.5px] leading-relaxed">
                Gezählte Tokens, gerechnet mit den Standardpreisen vom{" "}
                {new Date(prices.asOf).toLocaleDateString("de-DE", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}{" "}
                — Aktionspreise können es günstiger machen, nie teurer.
                {unpriced.length > 0 && (
                  <span className="text-das">
                    {" "}
                    {plural(unpriced.reduce((n, m) => n + m.calls, 0), "Aufruf", "Aufrufe")} mit{" "}
                    {unpriced.map((m) => m.model).join(", ")} {unpriced.length === 1 ? "ist" : "sind"}{" "}
                    hier nicht eingerechnet — dieses Modell steht nicht in der Preisliste.
                  </span>
                )}
                {budget.remaining <= 0 ? (
                  <span className="text-das">
                    {" "}
                    Das Budget ist aufgebraucht: Gespräch, Schreibkorrektur und neue
                    Erklärungen pausieren bis zum nächsten Fenster. Der Rest der App läuft
                    weiter.
                  </span>
                ) : (
                  projected !== null &&
                  projected > budget.ceiling * 0.8 && (
                    <span className="text-das"> Das wird knapp.</span>
                  )
                )}
              </p>
            </>
          )}
        </Section>

        {/* Minutes below the first hour. `Math.round(m / 60)` printed "0 h in
            30 Tagen" for a real session you had just finished — a true
            statement about hours that reads as "you have done nothing", on the
            page whose job is to show that you have. */}
        <Section
          title={
            totalMinutes < 60
              ? `Zeit — ${plural(totalMinutes, "Minute", "Minuten")} in 30 Tagen`
              : `Zeit — ${Math.round(totalMinutes / 60)} h in 30 Tagen`
          }
        >
          {days.length === 0 ? (
            <p className="text-muted text-[14px]">Noch keine Sitzung abgeschlossen.</p>
          ) : (
            <div className="flex h-[60px] items-end gap-1">
              {days.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.minutes} min`}
                  className="bg-line-strong flex-1 rounded-t-[1px]"
                  style={{ height: `${Math.min(100, (d.minutes / 90) * 100)}%` }}
                />
              ))}
            </div>
          )}
        </Section>
      </>
    </Page>
  );
}

const LABELS: Record<string, string> = {
  review: "Wiederholung",
  builder: "Sätze bauen",
  listening: "Hören",
  reading: "Lesen",
  speaking: "Sprechen",
  writing: "Schreiben",
  quiz: "Quiz",
  fix: "Fix",
  "new-vocab": "Neue Wörter",
  "new-grammar": "Grammatik",
  conversation: "Gespräch",
  cloze: "Lücken",
  "exam-lesen": "Test · Lesen",
  "exam-hoeren": "Test · Hören",
  "exam-wortschatz": "Test · Wortschatz",
  "exam-grammatik": "Test · Grammatik",
  "grammar-review": "Grammatik-Wdh.",
};

/**
 * Kinds that are not answers, and so have no accuracy.
 *
 * `exposure` is written by walk mode with correct = 1, unconditionally — it
 * records that a word was played into your ears, which is not a question you
 * can get wrong. Charted alongside the rest it rendered as a permanent
 * "exposure — 100%" bar, the exact shape of the fake progress principle 4
 * exists to prevent, and with a raw English key because LABELS had no entry.
 */
const NOT_GRADED = new Set(["exposure"]);

const COST_LABEL: Record<string, string> = {
  chat: "Gespräch",
  review: "Korrektur danach",
  writing: "Schreiben",
  explain: "Satz erklärt",
  mistake: "Fehler erklärt",
};

/* Derived from real recognition results — never a phoneme score. The map lives
   in lib/pairs.ts, next to the drills, because a sound this page can name and
   the drill cannot open on is worse than one it never mentions. */

function soundBreakdown(userId: string) {
  const rows = all<{ expected: string; user_answer: string }>(
    `SELECT expected, user_answer FROM attempt
      WHERE user_id = ? AND kind = 'speaking' AND expected IS NOT NULL`,
    userId,
  );
  if (!rows.length) return [];
  const tally = new Map<string, { ok: number; total: number }>();
  for (const r of rows) {
    const heard = new Set((r.user_answer ?? "").toLowerCase().replace(/[.,!?]/g, "").split(/\s+/));
    for (const w of r.expected.toLowerCase().replace(/[.,!?]/g, "").split(/\s+/)) {
      for (const [sound, re] of Object.entries(SOUND_SPELLING)) {
        if (!re.test(w)) continue;
        const t = tally.get(sound) ?? { ok: 0, total: 0 };
        t.total++;
        if (heard.has(w)) t.ok++;
        tally.set(sound, t);
      }
    }
  }
  return [...tally.entries()]
    .filter(([, v]) => v.total >= 3)
    .map(([sound, v]) => ({ sound, ...v }))
    .sort((a, b) => a.ok / a.total - b.ok / b.total);
}

function Stat({ n, label, hint }: { n: number; label: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-serif text-[40px] leading-none font-semibold tracking-[-0.03em]">
        {n}
      </span>
      <span className="font-mono text-secondary text-[11px] tracking-[0.08em] uppercase">
        {label}
      </span>
      <span className="text-muted/70 text-[11px] leading-tight">{hint}</span>
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="bg-line h-1.5 w-full overflow-hidden rounded-[2px]">
      <div
        className="bg-fg h-full rounded-[2px]"
        style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }}
      />
    </div>
  );
}
