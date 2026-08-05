import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import GrammarPractice from "./GrammarPractice";
import { TAP } from "@/lib/ui";

export const dynamic = "force-dynamic";

/** Grammar reference — the same component the session block uses, browsable. */
export default async function GrammarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const g = get<{
    id: string;
    slug: string;
    title: string;
    level: string;
    explain_md: string;
    examples_json: string;
    drills_json: string;
  }>("SELECT * FROM grammar WHERE slug = ?", slug);
  if (!g) notFound();

  const siblings = all<{ slug: string; title: string; level: string }>(
    "SELECT slug, title, level FROM grammar ORDER BY ord",
  );

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[880px] flex-1 px-6 py-10 md:px-10">
        <Link
          href="/ueben"
          className={`font-mono text-muted hover:text-secondary text-[12.5px] transition-colors ${TAP}`}
        >
          ← Üben
        </Link>

        <div className="mt-6">
          <GrammarPractice
            grammar={{ id: g.id, title: g.title, explain_md: g.explain_md }}
            examples={JSON.parse(g.examples_json)}
            drills={JSON.parse(g.drills_json)}
            level={g.level}
          />
        </div>

        <nav className="border-line-sub mt-12 border-t pt-6">
          <p className="font-mono text-muted mb-3 text-[11.5px] tracking-[0.14em] uppercase">
            Alle Themen · {siblings.length}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {siblings.map((s) => (
              <Link
                key={s.slug}
                href={`/grammatik/${s.slug}`}
                className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                  s.slug === slug
                    ? "bg-fg text-[#16211E]"
                    : "border-line text-secondary hover:border-line-strong hover:text-fg border"
                }`}
              >
                {s.title}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </main>
  );
}
