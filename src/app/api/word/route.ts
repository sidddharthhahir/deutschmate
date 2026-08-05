import { NextResponse } from "next/server";
import { get } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tap-a-word lookup for reading and video subtitles. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("lemma")?.trim() ?? "";
  if (!raw) return NextResponse.json({ en: null });

  const word = raw.replace(/[.,!?„"»«:;]/g, "");

  const byExact = get<{
    id: string;
    lemma: string;
    article: string | null;
    en: string;
  }>(
    "SELECT id, lemma, article, en FROM word WHERE lemma = ? COLLATE NOCASE",
    word,
  );
  if (byExact) return NextResponse.json(byExact);

  // Strip common verb/adjective endings and try the stem.
  const stems = [
    word.replace(/(st|en|et|te|e)$/i, ""),
    word.replace(/(st|en|et|te|e)$/i, "") + "en",
    word.replace(/n$/i, ""),
  ].filter((s) => s.length > 2);

  for (const s of stems) {
    const hit = get<{
      id: string;
      lemma: string;
      article: string | null;
      en: string;
    }>(
      "SELECT id, lemma, article, en FROM word WHERE lemma = ? COLLATE NOCASE",
      s,
    );
    if (hit) return NextResponse.json(hit);
  }

  // Last resort: prefix match, shortest first (closest to the base form).
  const prefix = get<{
    id: string;
    lemma: string;
    article: string | null;
    en: string;
  }>(
    "SELECT id, lemma, article, en FROM word WHERE lemma LIKE ? ORDER BY LENGTH(lemma) LIMIT 1",
    `${word.slice(0, Math.max(3, word.length - 2))}%`,
  );

  return NextResponse.json(prefix ?? { en: null });
}
