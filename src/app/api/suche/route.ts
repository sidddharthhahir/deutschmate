import { NextResponse } from "next/server";
import { all } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One search across everything the app contains. 2,400 words, 120 units, 36 grammar points, 38
 * readings and 120 scenarios sit behind four nav links and one search box on one page.
 */

export type Hit = {
  kind: "wort" | "grammatik" | "unit" | "szenario";
  label: string;
  sub: string;
  href: string;
};

const KIND_ORDER: Record<Hit["kind"], number> = {
  wort: 0,
  grammatik: 1,
  unit: 2,
  szenario: 3,
};

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const like = `%${q}%`;
  // Anchored matches first: typing "hau" should reach "Haus" before "Bauhaus".
  const starts = `${q}%`;

  const words = all<{
    id: string;
    lemma: string;
    article: string | null;
    en: string;
    level: string;
  }>(
    `SELECT id, lemma, article, en, level FROM word
      WHERE lemma LIKE ? OR en LIKE ?
      ORDER BY (CASE WHEN lemma LIKE ? THEN 0 ELSE 1 END), freq_rank
      LIMIT 8`,
    like,
    like,
    starts,
  );

  const grammar = all<{ slug: string; title: string; level: string }>(
    `SELECT slug, title, level FROM grammar WHERE title LIKE ? ORDER BY ord LIMIT 5`,
    like,
  );

  /* One row per unit. */
  const scenarios = all<{
    id: string;
    ord: number;
    title: string;
    level: string;
  }>(
    `SELECT id, ord, title, level FROM unit
      WHERE scenario_json IS NOT NULL AND title LIKE ?
      ORDER BY level, ord LIMIT 5`,
    like,
  );

  const hits: Hit[] = [
    ...words.map((w) => ({
      kind: "wort" as const,
      label: w.article ? `${w.article} ${w.lemma}` : w.lemma,
      sub: `${w.en} · ${w.level}`,
      href: `/wort/${w.id}`,
    })),
    ...grammar.map((g) => ({
      kind: "grammatik" as const,
      label: g.title,
      sub: g.level,
      href: `/grammatik/${g.slug}`,
    })),
    ...scenarios.map((u) => ({
      kind: "szenario" as const,
      label: u.title,
      sub: `${u.level} · Unit ${u.ord} · Gespräch`,
      href: `/szenario/${u.id}`,
    })),
  ];

  hits.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return NextResponse.json({ hits });
}
