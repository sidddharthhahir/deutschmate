import Link from "next/link";
import { all, get } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { topErrorTags } from "@/lib/errors";
import { currentStreak, paceProjection } from "@/lib/session";
import { LEECH_THRESHOLD, leeches } from "@/lib/leech";
import { examHistory, type SectionScore } from "@/lib/exam";
import { grammarStats } from "@/lib/grammar-srs";
import Noun from "@/components/Article";
import AppHeader from "@/components/AppHeader";

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
  const user = currentUser("sid");
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
  const seen = n("SELECT words_seen AS n FROM browse_progress WHERE user_id=?", user.id);

  const perSkill = all<{ kind: string; n: number; correct: number }>(
    `SELECT kind, COUNT(*) AS n, COALESCE(SUM(correct),0) AS correct
       FROM attempt WHERE user_id = ? GROUP BY kind ORDER BY n DESC`,
    user.id,
  );

  const levels = all<{ level: string; total: number }>(
    "SELECT level, COUNT(*) AS total FROM unit GROUP BY level ORDER BY level",
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

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[880px] flex-1 px-6 py-10 md:px-10">
        <div className="mb-8 flex items-baseline justify-between gap-4">
          <h1 className="font-serif text-[32px] font-semibold tracking-[-0.015em]">
            Fortschritt
          </h1>
          <div className="flex flex-none items-baseline gap-4">
            <Link href="/woche" className="text-accent text-[12.5px] hover:underline">
              Diese Woche →
            </Link>
            {streak > 0 && (
              <span className="font-mono text-muted text-[12.5px]">Tag {streak}</span>
            )}
          </div>
        </div>

        {/* Headline counts — the four that matter, in serif at size. */}
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat n={seen} label="gesehen" hint="im Wortschatz gelesen" />
          <Stat n={inDeck} label="im Deck" hint="mindestens 1× geübt" />
          <Stat n={learned} label="gelernt" hint="3+ Wdh., letzte 2 richtig" />
          <Stat n={mastered} label="gemeistert" hint="Stabilität > 30 Tage" />
        </div>
        <p className="text-muted mt-4 max-w-[62ch] text-[13px] leading-relaxed">
          „gesehen“ und „gelernt“ sind bewusst getrennt — Lesen ist Wiedererkennen,
          nicht Können.
        </p>

        <Section title={`Wortschatz — ${learned} von ${totalWords}`}>
          <Bar value={learned} max={totalWords} />
        </Section>

        <Section title={`Grammatik — ${gram.solid} von ${gram.total}`}>
          <Bar value={gram.solid} max={gram.total} />
          <p className="text-muted mt-3 max-w-[62ch] text-[12.5px] leading-relaxed">
            {gram.inDeck} Regeln sind eingeführt und werden wiederholt, {gram.solid} davon
            sitzen (3+ Wiederholungen). Grammatik läuft auf derselben Vergessenskurve wie
            Wörter — eine Regel, die du einmal gesehen hast, ist keine Regel, die du kannst.
          </p>
        </Section>

        {pace && (
          <Section title="Tempo">
            <p className="font-serif text-[19px] leading-relaxed">
              {pace.done} Units in {pace.days} Tagen — das sind{" "}
              <span className="text-accent">{pace.perWeek} pro Woche</span>. Bei diesem Tempo
              sind die restlichen {pace.remaining} in etwa {pace.weeksLeft} Wochen durch,
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

        <Section title={`Units — ${completed.size} von ${unitsByLevel.length}`}>
          <div className="space-y-4">
            {levels.map((lv) => {
              const us = unitsByLevel.filter((u) => u.level === lv.level);
              const doneN = us.filter((u) => completed.has(u.id)).length;
              return (
                <div key={lv.level}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="font-mono text-secondary text-[12.5px]">{lv.level}</span>
                    <span className="font-mono text-muted text-[11.5px]">
                      {doneN} / {us.length}
                    </span>
                  </div>
                  {/* One cell per unit — 120 cells total, readable at a glance. */}
                  <div className="flex gap-1">
                    {us.map((u) => (
                      <span
                        key={u.id}
                        title={`${u.ord}. ${u.title}`}
                        className={`h-2 flex-1 rounded-[1px] ${
                          completed.has(u.id) ? "bg-accent" : "bg-line"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
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
                  <span className="text-secondary">{t.label}</span>
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

        <Section title={`Zeit — ${Math.round(totalMinutes / 60)} h in 30 Tagen`}>
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
      </div>
    </main>
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
};

/** Derived from real recognition results — never a phoneme score. */
const SOUND_MAP: Record<string, RegExp> = {
  ü: /ü/, ö: /ö/, ä: /ä/, ch: /ch/, sch: /sch/,
  "sp / st": /^(sp|st)/, r: /r/, z: /z/, ß: /ß/,
  ei: /ei/, "eu / äu": /(eu|äu)/, ie: /ie/,
};

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
      for (const [sound, re] of Object.entries(SOUND_MAP)) {
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
