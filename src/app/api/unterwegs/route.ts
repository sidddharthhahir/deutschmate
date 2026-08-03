import { NextResponse } from "next/server";
import { run } from "@/lib/db";
import { activeUser } from "@/lib/user";
import { readJson, badRequest, str, int } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Log a hands-free listening round.
 *
 * kind='exposure', correct=1, and NO card is touched. Listening to a word on
 * a walk is contact, not retrieval — writing it into the review count would
 * inflate the one number that is supposed to mean "I recalled this", and
 * grading the cards from it would corrupt every schedule involved.
 *
 * It is recorded at all so the time isn't invisible: Fortschritt can say you
 * heard 40 words on Tuesday without claiming you reviewed them.
 */
export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(str(raw.user) || undefined);

  const heard = int(raw.heard, 1, 500);
  if (heard === null) return badRequest("heard (1-500) required");

  run(
    `INSERT INTO attempt (user_id, kind, ref_id, correct, user_answer)
     VALUES (?, 'exposure', NULL, 1, ?)`,
    user.id,
    String(heard),
  );

  return NextResponse.json({ ok: true, heard });
}
