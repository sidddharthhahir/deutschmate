import { NextResponse } from "next/server";
import { createEmptyCard } from "ts-fsrs";
import { run, tx } from "@/lib/db";
import { activeUser } from "@/lib/user";
import { readJson, badRequest, str, arr, unauthorized } from "@/lib/http";
import { scanText } from "@/lib/scan";
import { toSqlDate } from "@/lib/srs";
import { TEXT_MAX_CHARS as MAX_CHARS } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Long enough for a letter or an article, short enough not to be abused. */

/** POST — read a pasted text against this learner's deck. */
export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(req, raw);
  if (!user) return unauthorized();
  const action = str(raw.action, 20) || "scan";

  if (action === "add") {
    const ids = arr<string>(raw.wordIds)
      .filter((s) => typeof s === "string" && s.length > 0 && s.length < 80)
      .slice(0, 500);
    if (!ids.length) return badRequest("wordIds required");

    // Cards land due immediately: adding a word by hand is a deliberate
    // "teach me this", unlike the course's own pacing.
    const due = toSqlDate(createEmptyCard(new Date()).due);
    let added = 0;
    tx(() => {
      for (const id of ids) {
        const res = run(
          `INSERT INTO card (user_id, ref_type, ref_id, due, state)
           VALUES (?, 'word', ?, ?, 0)
           ON CONFLICT(user_id, ref_type, ref_id) DO NOTHING`,
          user.id,
          id,
          due,
        );
        if (res.changes) added++;
      }
    });
    // `added` counts rows actually created — words already in the deck are not
    // counted as new, so the number on screen is never inflated.
    return NextResponse.json({ ok: true, added, requested: ids.length });
  }

  const text = typeof raw.text === "string" ? raw.text : "";
  if (!text.trim()) return badRequest("text required");
  if (text.length > MAX_CHARS) {
    return badRequest(`text too long (max ${MAX_CHARS} characters)`);
  }

  return NextResponse.json(scanText(user.id, text));
}
