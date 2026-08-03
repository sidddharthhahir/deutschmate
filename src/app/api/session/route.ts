import { NextResponse } from "next/server";
import { currentUser, userFromRequest } from "@/lib/user";
import { readJson, str, int, arr } from "@/lib/http";
import {
  buildSession,
  logSession,
  currentStreak,
  markUnitComplete,
  unseenInUnit,
} from "@/lib/session";
import { dueCount } from "@/lib/srs";
import { get } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — today's session plan. This is what the one button opens. */
export async function GET(req: Request) {
  const user = userFromRequest(req);
  const shape = new URL(req.url).searchParams.get("shape") === "short" ? "short" : "full";
  const plan = buildSession(user.id, user.level, shape);

  return NextResponse.json({
    // plan.level, not user.level — building the session can promote the learner
    // to the next level, and the stale copy would show the old one for a day.
    user: { id: user.id, name: user.name, level: plan.level, goal: user.daily_goal_min },
    streak: currentStreak(user.id),
    ...plan,
  });
}

/** POST — finish a session: log minutes, mark the unit, return the recap. */
export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = currentUser(str(raw.user) || "sid");

  // Clamped: a client that reports 10,000 minutes is wrong, and writing that
  // into session_log would poison every total on Fortschritt permanently.
  const minutes = int(raw.minutes, 0, 12 * 60) ?? 0;
  const blocks = arr<string>(raw.blocks)
    .filter((b) => typeof b === "string")
    .slice(0, 20);
  const completeUnit = str(raw.completeUnit, 40);

  /* A unit is finished when its words have all been introduced, not when a
     session containing it ends. Four units hold more words than one day can
     introduce; completing them on time would drop the remainder. Those units
     simply take two days, and the learner sees the same unit again tomorrow. */
  let unitDone = false;
  let wordsLeft = 0;
  if (completeUnit) {
    wordsLeft = unseenInUnit(user.id, completeUnit);
    if (wordsLeft === 0) {
      markUnitComplete(user.id, completeUnit);
      unitDone = true;
    }
  }

  const streak = logSession(user.id, minutes, blocks);

  // Recap numbers: all counted from attempts, none invented (principle 4).
  const today = get<{ n: number; correct: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(correct),0) AS correct
       FROM attempt WHERE user_id = ? AND date(created_at) = date('now')`,
    user.id,
  );
  const reviews = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM attempt
      WHERE user_id = ? AND kind='review' AND date(created_at) = date('now')`,
    user.id,
  );
  const newWords = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM attempt
      WHERE user_id = ? AND kind='new-vocab' AND date(created_at) = date('now')`,
    user.id,
  );

  const topMistake = get<{ tags: string }>(
    `SELECT error_tags_json AS tags FROM attempt
      WHERE user_id = ? AND correct = 0 AND date(created_at) = date('now')
      ORDER BY id DESC LIMIT 1`,
    user.id,
  );

  return NextResponse.json({
    ok: true,
    streak,
    unitDone,
    wordsLeft,
    recap: {
      attempts: today?.n ?? 0,
      correct: today?.correct ?? 0,
      accuracy: today?.n ? Math.round(((today.correct ?? 0) / today.n) * 100) : null,
      reviews: reviews?.n ?? 0,
      newWords: newWords?.n ?? 0,
      remainingDue: dueCount(user.id),
      lastMistakeTags: topMistake ? (JSON.parse(topMistake.tags) as string[]) : [],
    },
  });
}
