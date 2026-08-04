import { NextResponse } from "next/server";
import { get } from "@/lib/db";
import { activeUser } from "@/lib/user";
import { readJson, badRequest, notFound, str, int, bool } from "@/lib/http";
import { dueCards, dueCount, gradeCard } from "@/lib/srs";
import { whyWrong } from "@/lib/why";
import type { Grade } from "ts-fsrs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ownsCard = (userId: string, cardId: number) =>
  get<{ id: number }>("SELECT id FROM card WHERE id = ? AND user_id = ?", cardId, userId) !==
  undefined;

export async function GET(req: Request) {
  const user = await activeUser(new URL(req.url).searchParams.get("user") ?? undefined);

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
  const user = await activeUser(str(raw.user) || undefined);

  const cardId = int(raw.cardId, 1);
  const grade = int(raw.grade, 1, 4);
  if (cardId === null || grade === null) {
    return badRequest("cardId (positive integer) and grade (1-4) required");
  }

  /* A card id that doesn't belong to this user is a bad request, not a server
     fault. gradeCard throws for an unknown card, which surfaced as a bare 500
     for anything from a stale tab to a mistyped id. */
  if (!ownsCard(user.id, cardId)) return notFound(`card ${cardId} not found`);

  const answer = str(raw.answer) || undefined;
  const expected = str(raw.expected) || undefined;

  const { due: nextDue, ...rest } = gradeCard(user.id, cardId, grade as Grade, {
    answer,
    expected,
  });

  /* "Why?" on a typed answer that was wrong.
     It lives here rather than in a second call to /api/attempt because
     gradeCard has already logged the attempt — a separate call would log it
     twice and quietly skew every accuracy figure in the app. Same three tiers
     as everywhere else: cache, then the cheap model, then the rule-based tag
     description, so this never becomes a reason a card can't be graded. */
  let explanation: string | null = null;
  if (bool(raw.explain) && expected && answer && grade < 3) {
    explanation = (await whyWrong(user.id, expected, answer)).text;
  }

  // `due` means two different things here — the card's next date and the
  // queue length. Name them apart so the spread can't clobber one.
  return NextResponse.json({
    ok: true,
    nextDue,
    ...rest,
    explanation,
    remaining: dueCount(user.id),
  });
}
