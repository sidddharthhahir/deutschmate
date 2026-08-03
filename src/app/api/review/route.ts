import { NextResponse } from "next/server";
import { get } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { readJson, badRequest, notFound, str, int } from "@/lib/http";
import { dueCards, dueCount, gradeCard } from "@/lib/srs";
import type { Grade } from "ts-fsrs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ownsCard = (userId: string, cardId: number) =>
  get<{ id: number }>("SELECT id FROM card WHERE id = ? AND user_id = ?", cardId, userId) !==
  undefined;

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("user") ?? "sid";
  const user = currentUser(name);

  // Deck size = words actually met. There is no top-up: a card appears when a
  // word is introduced, so this number is a count of learning, not of seeding.
  const total = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM card WHERE user_id = ? AND ref_type='word'",
    user.id,
  )?.n ?? 0;

  const reviewedToday = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM attempt
      WHERE user_id = ? AND kind='review' AND date(created_at) = date('now')`,
    user.id,
  )?.n ?? 0;

  const learned = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM card
      WHERE user_id = ? AND ref_type='word' AND reps >= 3 AND state = 2`,
    user.id,
  )?.n ?? 0;

  const mastered = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM card
      WHERE user_id = ? AND ref_type='word' AND stability > 30`,
    user.id,
  )?.n ?? 0;

  return NextResponse.json({
    user: user.id,
    cards: dueCards(user.id, 60),
    stats: {
      due: dueCount(user.id),
      total,
      reviewedToday,
      learned,
      mastered,
    },
  });
}

export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = currentUser(str(raw.user) || "sid");

  const cardId = int(raw.cardId, 1);
  const grade = int(raw.grade, 1, 4);
  if (cardId === null || grade === null) {
    return badRequest("cardId (positive integer) and grade (1-4) required");
  }

  /* A card id that doesn't belong to this user is a bad request, not a server
     fault. gradeCard throws for an unknown card, which surfaced as a bare 500
     for anything from a stale tab to a mistyped id. */
  if (!ownsCard(user.id, cardId)) return notFound(`card ${cardId} not found`);

  const { due: nextDue, ...rest } = gradeCard(user.id, cardId, grade as Grade, {
    answer: str(raw.answer) || undefined,
    expected: str(raw.expected) || undefined,
  });
  // `due` means two different things here — the card's next date and the
  // queue length. Name them apart so the spread can't clobber one.
  return NextResponse.json({ ok: true, nextDue, ...rest, remaining: dueCount(user.id) });
}
