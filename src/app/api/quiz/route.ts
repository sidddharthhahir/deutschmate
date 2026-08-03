import { NextResponse } from "next/server";
import { userFromRequest } from "@/lib/user";
import { all, get } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Word = {
  id: string;
  lemma: string;
  article: string | null;
  plural: string | null;
  pos: string;
  en: string;
};

/**
 * The closing quiz is built from what the learner actually touched today —
 * no generation, no model call, fully offline. Question types rotate so the
 * last pass isn't eight identical multiple-choice items.
 */
export async function GET(req: Request) {
  const user = userFromRequest(req);
  const unitId = new URL(req.url).searchParams.get("unit");

  const touched = all<Word>(
    `SELECT DISTINCT w.id, w.lemma, w.article, w.plural, w.pos, w.en
       FROM attempt a JOIN word w ON w.id = a.ref_id
      WHERE a.user_id = ? AND date(a.created_at) = date('now')
      ORDER BY RANDOM() LIMIT 20`,
    user.id,
  );

  // Nothing done today yet — fall back to the unit's own words.
  let pool = touched;
  if (pool.length < 4 && unitId) {
    const u = get<{ word_ids_json: string }>(
      "SELECT word_ids_json FROM unit WHERE id = ?",
      unitId,
    );
    const ids: string[] = u ? JSON.parse(u.word_ids_json) : [];
    if (ids.length) {
      const ph = ids.map(() => "?").join(",");
      pool = all<Word>(
        `SELECT id, lemma, article, plural, pos, en FROM word WHERE id IN (${ph})`,
        ...ids,
      );
    }
  }
  if (pool.length < 4) return NextResponse.json({ questions: [] });

  const distractors = (w: Word, key: (x: Word) => string | null) =>
    pool
      .filter((x) => x.id !== w.id && key(x) && key(x) !== key(w))
      .map(key)
      .filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i)
      .slice(0, 3);

  const questions = [];
  for (const w of pool) {
    if (questions.length >= 8) break;

    // Article question — only for nouns, and only when we have alternatives.
    if (w.pos === "noun" && w.article && questions.length % 3 === 1) {
      const opts = ["der", "die", "das"];
      questions.push({
        q: `___ ${w.lemma}`,
        options: opts,
        a: opts.indexOf(w.article),
        why: `${w.article} ${w.lemma}${w.plural ? ` — Plural: die ${w.plural}` : ""}`,
        refId: w.id,
      });
      continue;
    }

    // German → English.
    const wrong = distractors(w, (x) => x.en);
    if (wrong.length < 3) continue;
    const opts = [w.en, ...wrong].sort(() => Math.random() - 0.5);
    questions.push({
      q: `${w.article ? w.article + " " : ""}${w.lemma}`,
      options: opts,
      a: opts.indexOf(w.en),
      refId: w.id,
    });
  }

  return NextResponse.json({ questions: questions.slice(0, 8) });
}
