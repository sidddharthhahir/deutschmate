import { NextResponse } from "next/server";
import { run } from "@/lib/db";
import { activeUser } from "@/lib/user";
import { readJson, badRequest, int, unauthorized } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Log a hands-free listening round. kind='exposure', correct=1, and NO card is touched. */
export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(req, raw);
  if (!user) return unauthorized();

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
