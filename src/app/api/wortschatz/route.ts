import { NextResponse } from "next/server";
import { currentUser, userFromRequest } from "@/lib/user";
import { all, get, run } from "@/lib/db";
import { toSqlDate } from "@/lib/srs";
import { createEmptyCard } from "ts-fsrs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wortschatz — browse the whole vocabulary (spec §5).
 *
 * Because the browse deck IS the curriculum deck, each row can say which unit
 * teaches the word. Browsing is reading ahead in your own course, and
 * [+ Deck] means "teach me this now, before Unit 88 comes round".
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = userFromRequest(req);
  const level = url.searchParams.get("level");
  const topic = url.searchParams.get("topic");
  const q = url.searchParams.get("q")?.trim();
  const size = Number(url.searchParams.get("size") ?? user.browse_batch_size);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const where: string[] = [];
  const params: unknown[] = [];
  if (level) { where.push("w.level = ?"); params.push(level); }
  if (topic) { where.push("w.topic = ?"); params.push(topic); }
  if (q) {
    where.push("(w.lemma LIKE ? OR w.en LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = all(
    `SELECT w.*, u.id AS unit_id, u.ord AS unit_ord, u.title AS unit_title,
            CASE WHEN c.reps > 0 THEN 1 ELSE 0 END AS in_deck,
            c.stability
       FROM word w
       LEFT JOIN card c ON c.ref_id = w.id AND c.ref_type='word' AND c.user_id = ?
       LEFT JOIN unit u ON EXISTS (
         SELECT 1 FROM json_each(u.word_ids_json) je WHERE je.value = w.id
       )
       ${clause}
       ORDER BY w.freq_rank
       LIMIT ? OFFSET ?`,
    user.id,
    ...params,
    size,
    offset,
  );

  const total = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM word w ${clause}`,
    ...params,
  )?.n ?? 0;

  const progress = get<{ words_seen: number; last_word_id: string | null }>(
    "SELECT words_seen, last_word_id FROM browse_progress WHERE user_id = ?",
    user.id,
  );

  const topics = all<{ topic: string; n: number }>(
    "SELECT topic, COUNT(*) AS n FROM word WHERE topic IS NOT NULL GROUP BY topic ORDER BY n DESC",
  );

  return NextResponse.json({
    words: rows,
    total,
    offset,
    size,
    topics,
    seen: progress?.words_seen ?? 0,
    batchSize: user.browse_batch_size,
  });
}

/** Mark a batch as seen, or promote a word into the active deck. */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    user?: string;
    action: "seen" | "add";
    wordId?: string;
    lastWordId?: string;
    count?: number;
  };
  const user = currentUser(body.user ?? "sid");

  if (body.action === "seen") {
    run(
      `INSERT INTO browse_progress (user_id, last_word_id, words_seen, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE
         SET last_word_id = excluded.last_word_id,
             words_seen = words_seen + excluded.words_seen,
             updated_at = datetime('now')`,
      user.id,
      body.lastWordId ?? null,
      body.count ?? 0,
    );
    const seen = get<{ n: number }>(
      "SELECT words_seen AS n FROM browse_progress WHERE user_id = ?",
      user.id,
    )?.n ?? 0;
    // Counted separately from "learned" on purpose — principle 4 (spec §5).
    return NextResponse.json({ ok: true, seen });
  }

  if (body.action === "add" && body.wordId) {
    const empty = createEmptyCard(new Date());
    run(
      `INSERT INTO card (user_id, ref_type, ref_id, due, stability, difficulty,
         elapsed_days, scheduled_days, reps, lapses, state)
       VALUES (?, 'word', ?, ?, 0, 0, 0, 0, 0, 0, 0)
       ON CONFLICT(user_id, ref_type, ref_id) DO UPDATE SET due = excluded.due`,
      user.id,
      body.wordId,
      toSqlDate(empty.due),
    );
    return NextResponse.json({ ok: true, added: body.wordId });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
