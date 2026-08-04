import { NextResponse } from "next/server";
import { activeUser } from "@/lib/user";
import { unauthorized } from "@/lib/http";
import { all, get, run, tx } from "@/lib/db";
import { toSqlDate } from "@/lib/srs";
import { createEmptyCard } from "ts-fsrs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Words per page. Was `user.browse_batch_size`, a column with a default of 50,
   no screen that could change it, and a client that hardcoded 50 anyway — the
   two happened to agree, which is the only reason nothing looked wrong. */
const BATCH = 50;

/**
 * Wortschatz — browse the whole vocabulary (spec §5).
 *
 * Because the browse deck IS the curriculum deck, each row can say which unit
 * teaches the word. Browsing is reading ahead in your own course, and
 * [+ Deck] means "teach me this now, before Unit 88 comes round".
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await activeUser(req);
  if (!user) return unauthorized();
  const level = url.searchParams.get("level");
  const topic = url.searchParams.get("topic");
  const q = url.searchParams.get("q")?.trim();
  const size = Number(url.searchParams.get("size") ?? BATCH);
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
            -- A card exists, not "has been answered". The badge is set by the
            -- "+ Deck" button, which creates the card with reps = 0 — so
            -- testing reps > 0 meant "im Deck" flipped back to "+ Deck" on the
            -- next page turn, search or refresh, every time. The card was
            -- always really there; only the badge disagreed.
            CASE WHEN c.id IS NOT NULL THEN 1 ELSE 0 END AS in_deck,
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

  const seen = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM word_seen WHERE user_id = ?",
    user.id,
  )?.n ?? 0;

  const topics = all<{ topic: string; n: number }>(
    "SELECT topic, COUNT(*) AS n FROM word WHERE topic IS NOT NULL GROUP BY topic ORDER BY n DESC",
  );

  return NextResponse.json({
    words: rows,
    total,
    offset,
    size,
    topics,
    seen,
    batchSize: BATCH,
  });
}

/** Mark a batch as seen, or promote a word into the active deck. */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    user?: string;
    action: "seen" | "add";
    wordId?: string;
    /** The ids actually on screen. A count alone cannot be deduplicated. */
    wordIds?: unknown;
  };
  const user = await activeUser(req, body);
  if (!user) return unauthorized();

  if (body.action === "seen") {
    /* One row per word, ignored on repeat. The previous version added the
       batch size to a running total, so the headline "gesehen" figure counted
       page turns: browsing back and forward, or switching topic, inflated it
       without a single new word being read. */
    const ids = (Array.isArray(body.wordIds) ? body.wordIds : [])
      .filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 64)
      .slice(0, 500);
    if (ids.length) {
      tx(() => {
        for (const id of ids) {
          run("INSERT OR IGNORE INTO word_seen (user_id, word_id) VALUES (?, ?)", user.id, id);
        }
      });
    }
    const seen = get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM word_seen WHERE user_id = ?",
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
       -- DO NOTHING, like /api/text. Updating due meant that tapping "+ Deck"
       -- on a word already halfway up the curve yanked it back to today and
       -- threw away weeks of scheduling — a destructive act behind a button
       -- whose only advertised effect is "add".
       ON CONFLICT(user_id, ref_type, ref_id) DO NOTHING`,
      user.id,
      body.wordId,
      toSqlDate(empty.due),
    );
    return NextResponse.json({ ok: true, added: body.wordId });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
