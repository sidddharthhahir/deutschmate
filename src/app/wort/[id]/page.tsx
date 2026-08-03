import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { currentUser } from "@/lib/user";
import AppHeader from "@/components/AppHeader";
import Noun, { ArticleWord } from "@/components/Article";
import WordAudio from "./WordAudio";

export const dynamic = "force-dynamic";

type Word = {
  id: string;
  lemma: string;
  article: string | null;
  plural: string | null;
  pos: string;
  ipa: string | null;
  en: string;
  level: string;
  topic: string | null;
  audio_url: string | null;
  audio_source: string | null;
  forms_json: string | null;
  mnemonic: string | null;
  example_de: string | null;
  example_en: string | null;
};

/**
 * Word detail — everything the app knows about one word.
 * Pure joins over data that already exists.
 */
export default async function WordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = currentUser("sid");

  const w = get<Word>("SELECT * FROM word WHERE id = ?", id);
  if (!w) notFound();

  const unit = get<{ id: string; ord: number; title: string; can_do_json: string }>(
    `SELECT u.id, u.ord, u.title, u.can_do_json FROM unit u
      WHERE EXISTS (SELECT 1 FROM json_each(u.word_ids_json) je WHERE je.value = ?)`,
    id,
  );

  const card = get<{
    reps: number; lapses: number; stability: number; due: string; state: number;
  }>(
    "SELECT reps, lapses, stability, due, state FROM card WHERE user_id=? AND ref_type='word' AND ref_id=?",
    user.id,
    id,
  );

  const mistakes = all<{ kind: string; user_answer: string; created_at: string }>(
    `SELECT kind, user_answer, created_at FROM attempt
      WHERE user_id=? AND ref_id=? AND correct=0 ORDER BY id DESC LIMIT 8`,
    user.id,
    id,
  );

  const alsoIn = all<{ de: string; en: string }>(
    `SELECT example_de AS de, example_en AS en FROM word
      WHERE example_de LIKE ? AND id != ? AND example_de IS NOT NULL LIMIT 5`,
    `%${w.lemma}%`,
    id,
  );

  const related = all<{ id: string; lemma: string; article: string | null }>(
    "SELECT id, lemma, article FROM word WHERE topic = ? AND id != ? ORDER BY freq_rank LIMIT 12",
    w.topic,
    id,
  );

  const forms = w.forms_json ? (JSON.parse(w.forms_json) as Record<string, string>) : null;
  const isNoun = w.pos === "noun" && w.article;
  const STATE = ["neu", "wird gelernt", "im Umlauf", "wird aufgefrischt"];

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[880px] flex-1 px-6 py-10 md:px-10">
        <Link
          href="/wortschatz"
          className="font-mono text-muted hover:text-secondary text-[12.5px] transition-colors"
        >
          ← Wortschatz
        </Link>

        <header className="border-line-sub mt-6 flex items-start justify-between gap-6 border-b pb-7">
          <div>
            <h1 className="font-serif text-[44px] leading-none font-semibold tracking-[-0.02em] md:text-[56px]">
              <Noun article={isNoun ? w.article : null}>{w.lemma}</Noun>
            </h1>
            <p className="font-serif text-secondary mt-3 text-[24px]">{w.en}</p>
            <p className="font-mono text-muted mt-2 text-[12px]">
              {w.pos}
              {isNoun && w.plural && (
                <>
                  {" · Plural: "}
                  <ArticleWord article="die" /> {w.plural}
                </>
              )}
              {w.ipa && ` · ${w.ipa}`} · {w.level}
              {w.topic && ` · ${w.topic}`}
            </p>
          </div>
          <WordAudio url={w.audio_url} lemma={w.lemma} source={w.audio_source} />
        </header>

        {forms && (
          <Section title="Formen">
            <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
              {Object.entries(forms).map(([p, f]) => (
                <div key={p} className="border-line-sub flex justify-between border-b py-2">
                  <span className="font-mono text-muted text-[12.5px]">{p}</span>
                  <span className="font-serif text-fg text-[17px]">{f}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {w.example_de && (
          <Section title="Beispiel">
            <div className="border-line bg-surface rounded-xl border p-5">
              <p className="font-serif text-[20px]">{w.example_de}</p>
              <p className="text-muted mt-1 text-[14px]">{w.example_en}</p>
            </div>
          </Section>
        )}

        {w.mnemonic && (
          <Section title="Eselsbrücke">
            <p className="font-serif text-accent/85 text-[18px] italic">{w.mnemonic}</p>
          </Section>
        )}

        {unit && (
          <Section title="Kommt vor in">
            <div className="border-line rounded-xl border p-4">
              <p className="font-serif text-[18px]">
                Unit {unit.ord} · {unit.title}
              </p>
              <p className="text-muted mt-1 text-[12.5px]">
                {(JSON.parse(unit.can_do_json) as string[]).join(" · ")}
              </p>
            </div>
          </Section>
        )}

        <Section title="Dein Stand">
          {card && card.reps > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Mini n={card.reps} label="Wiederholungen" />
                <Mini n={card.lapses} label="vergessen" />
                <Mini n={`${Math.round(card.stability)}d`} label="Stabilität" />
                <Mini n={STATE[card.state] ?? "?"} label="Status" />
              </div>
              <p className="font-mono text-muted mt-4 text-[11.5px]">
                Nächste Wiederholung: {card.due.slice(0, 16).replace("T", " ")}
              </p>
            </>
          ) : (
            <p className="text-muted text-[14px]">Noch nicht geübt.</p>
          )}
        </Section>

        {mistakes.length > 0 && (
          <Section title={`Deine Fehler mit diesem Wort · ${mistakes.length}`}>
            <div className="space-y-1.5">
              {mistakes.map((m, n) => (
                <div key={n} className="rounded-lg bg-[#251A20] px-3.5 py-2.5">
                  <span className="font-serif text-[16px] text-[#E8C8D6]">{m.user_answer}</span>
                  <span className="font-mono text-muted ml-3 text-[11px]">
                    {m.kind} · {m.created_at.slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {alsoIn.length > 0 && (
          <Section title="Auch in diesen Sätzen">
            <div className="space-y-2">
              {alsoIn.map((s, n) => (
                <div key={n} className="border-line-sub rounded-lg border px-4 py-2.5">
                  <p className="font-serif text-[17px]">{s.de}</p>
                  <p className="text-muted text-[13px]">{s.en}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {related.length > 0 && (
          <Section title={`Verwandt · ${w.topic}`}>
            <div className="flex flex-wrap gap-1.5">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/wort/${r.id}`}
                  className="border-line hover:border-line-strong hover:bg-raised font-serif rounded-full border px-3.5 py-1.5 text-[15px] transition-colors"
                >
                  <Noun article={r.article} gap="mr-1.5">
                    {r.lemma}
                  </Noun>
                </Link>
              ))}
            </div>
          </Section>
        )}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-mono text-muted mb-3 text-[11.5px] tracking-[0.14em] uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Mini({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="border-line rounded-xl border p-3.5">
      <div className="font-serif text-[22px] font-semibold">{n}</div>
      <div className="font-mono text-muted mt-0.5 text-[10.5px] tracking-[0.06em] uppercase">
        {label}
      </div>
    </div>
  );
}
