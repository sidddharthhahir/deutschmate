import { NextResponse } from "next/server";
import { activeUser } from "@/lib/user";
import { unauthorized } from "@/lib/http";
import { all, get } from "@/lib/db";
import { fourChoices } from "@/lib/choices";

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
 * The closing quiz is built from what the learner actually touched today — no generation, no model
 * call, fully offline.
 */
export async function GET(req: Request) {
  const user = await activeUser(req);
  if (!user) return unauthorized();
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

    /*
     * German → English, through fourChoices rather than by hand.
     *
     * This route used to take the first three other words of the pool as
     * distractors, and the pool does not change between questions — so the
     * whole quiz offered one set of options and you could answer "Zahlen 0–20"
     * by elimination without reading the German. That is bug (1) in
     * lib/choices.ts, which was written to fix exactly this and then never
     * adopted here. It also rejects a gloss that shares a meaning with the
     * answer, which the hand-rolled version did not, and orders the options
     * stably instead of with `sort(() => Math.random() - 0.5)` — a comparator
     * that is not a valid ordering and does not shuffle uniformly.
     */
    const opts = fourChoices(w, pool);
    if (opts.length < 4) continue;
    questions.push({
      q: `${w.article ? w.article + " " : ""}${w.lemma}`,
      options: opts,
      a: opts.indexOf(w.en),
      refId: w.id,
    });
  }

  return NextResponse.json({ questions: questions.slice(0, 8) });
}
