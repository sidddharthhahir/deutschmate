import Link from "next/link";
import { notFound } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { all, get } from "@/lib/db";
import { activeUser } from "@/lib/user";
import { de } from "@/lib/tags";

export const dynamic = "force-dynamic";

/**
 * One mistake, every time you made it.
 *
 * Fortschritt could say "article-akkusativ · 23×" and stop there, which tells
 * you that something is wrong without ever showing you the thing. Every row
 * here is already stored — `expected`, `user_answer` and `error_tags_json` are
 * written on every attempt — so this page is a query, not new data collection.
 */

/** Tag → the grammar point that actually explains it. */
const TAG_TO_SLUG: Record<string, string> = {
  "article-gender": "artikel-nominativ",
  "article-akkusativ": "akkusativ",
  "verb-ending": "praesens-regular",
  "verb-position-2": "verb-position-2",
  "verb-final": "modalverben",
  plural: "plural",
  negation: "nicht-kein",
  pronoun: "personalpronomen",
  "word-order": "verb-position-2",
};

const KIND_LABEL: Record<string, string> = {
  review: "Wiederholung",
  builder: "Sätze bauen",
  listening: "Hören",
  reading: "Lesen",
  speaking: "Sprechen",
  writing: "Schreiben",
  quiz: "Quiz",
  cloze: "Lücken",
  "new-vocab": "Neue Wörter",
  "new-grammar": "Grammatik",
  "grammar-review": "Grammatik-Wdh.",
  "exam-lesen": "Test · Lesen",
  "exam-hoeren": "Test · Hören",
  "exam-wortschatz": "Test · Wortschatz",
  "exam-grammatik": "Test · Grammatik",
};

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const label = de(tag);
  if (!label) notFound();

  const user = await activeUser();

  const rows = all<{
    id: number;
    kind: string;
    expected: string | null;
    user_answer: string | null;
    created_at: string;
  }>(
    `SELECT id, kind, expected, user_answer, created_at
       FROM attempt
      WHERE user_id = ? AND correct = 0
        AND error_tags_json LIKE ?
        AND expected IS NOT NULL
      ORDER BY id DESC
      LIMIT 60`,
    user.id,
    `%"${tag}"%`,
  );

  /* Two counts, thirty days apart, so the page can say whether this is getting
     better — a direction, not a grade. */
  const recent =
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM attempt
        WHERE user_id = ? AND correct = 0 AND error_tags_json LIKE ?
          AND created_at > datetime('now','-14 days')`,
      user.id,
      `%"${tag}"%`,
    )?.n ?? 0;
  const earlier =
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM attempt
        WHERE user_id = ? AND correct = 0 AND error_tags_json LIKE ?
          AND created_at <= datetime('now','-14 days')
          AND created_at > datetime('now','-28 days')`,
      user.id,
      `%"${tag}"%`,
    )?.n ?? 0;

  const slug = TAG_TO_SLUG[tag];
  const rule = slug
    ? get<{ slug: string; title: string }>(
        "SELECT slug, title FROM grammar WHERE slug = ?",
        slug,
      )
    : undefined;

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[760px] flex-1 px-6 py-10 md:px-10">
        <Link
          href="/fortschritt"
          className="font-mono text-muted hover:text-secondary text-[12px] transition-colors"
        >
          ← Fortschritt
        </Link>

        <h1 className="font-serif mt-4 text-[30px] font-semibold tracking-[-0.015em]">
          {label}
        </h1>

        <p className="font-mono text-muted mt-3 text-[12.5px]">
          {recent}× in 14 Tagen
          {earlier > 0 && (
            <>
              {" · "}
              {earlier}× in den 14 Tagen davor
              {" · "}
              <span className={recent < earlier ? "text-accent" : "text-das"}>
                {recent < earlier ? "seltener" : recent > earlier ? "häufiger" : "gleich"}
              </span>
            </>
          )}
        </p>

        {rule && (
          <Link
            href={`/grammatik/${rule.slug}`}
            className="border-line hover:border-line-strong mt-6 flex items-baseline justify-between gap-4 rounded-xl border px-5 py-4 transition-colors"
          >
            <span className="font-serif text-[18px]">{rule.title}</span>
            <span className="font-mono text-muted flex-none text-[11.5px]">
              Regel nachlesen →
            </span>
          </Link>
        )}

        <section className="border-line-sub mt-10 border-t pt-6">
          <h2 className="font-mono text-muted mb-4 text-[11.5px] tracking-[0.14em] uppercase">
            Jedes Mal · {rows.length}
            {rows.length === 60 && " (neueste)"}
          </h2>

          {rows.length === 0 ? (
            <p className="text-muted text-[14px]">
              Noch kein Beispiel gespeichert. Der Zähler steigt erst, wenn ein Fehler mit
              vollem Satz aufgezeichnet wurde.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="border-line-sub rounded-xl border p-4">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="font-mono text-muted text-[10.5px] tracking-[0.1em] uppercase">
                      {KIND_LABEL[r.kind] ?? r.kind}
                    </span>
                    <span className="font-mono text-muted/60 flex-none text-[10.5px]">
                      {r.created_at.slice(0, 10)}
                    </span>
                  </div>
                  <p className="font-serif text-das/70 text-[16px] line-through">
                    {r.user_answer || "—"}
                  </p>
                  <p className="font-serif text-fg mt-1 text-[18px]">{r.expected}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="text-muted mt-8 max-w-[62ch] text-[12.5px] leading-relaxed">
          Diese Liste ist gezählt, nicht bewertet. Sie sagt dir, wie oft und wobei — nicht,
          wie gut du bist.
        </p>
      </div>
    </main>
  );
}
