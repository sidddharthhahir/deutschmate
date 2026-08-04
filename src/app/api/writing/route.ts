import { NextResponse } from "next/server";
import { activeUser } from "@/lib/user";
import { readJson, badRequest, str, bool, unauthorized } from "@/lib/http";
import { recordUsage } from "@/lib/cost";
import { correctWriting, aiAvailable, BudgetExceeded } from "@/lib/ai";
import { logAttempt, type Tag } from "@/lib/errors";
import { all, get, run } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Writing correction, with the offline queue from spec §17.
 *
 * Offline you still write — the text is queued locally and corrected on
 * reconnect. Writing is the one block where "do it now, grade it later" is a
 * genuinely fine experience, so it never blocks a session.
 */
export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(req, raw);
  if (!user) return unauthorized();

  const text = str(raw.body, 4000);
  // `prompt` is NOT NULL in pending_correction, so a missing one used to fail
  // the insert rather than the request.
  const prompt = str(raw.prompt, 500) || "Freies Schreiben";

  if (!text) {
    return badRequest("empty");
  }

  if (bool(raw.queueOnly) || !aiAvailable(user.id)) {
    run(
      "INSERT INTO pending_correction (user_id, prompt, body) VALUES (?, ?, ?)",
      user.id,
      prompt,
      text,
    );
    const n =
      get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM pending_correction WHERE user_id = ? AND resolved_at IS NULL",
        user.id,
      )?.n ?? 0;
    return NextResponse.json({ queued: true, pending: n });
  }

  try {
    const call = await correctWriting({
      userId: user.id,
      level: user.level,
      prompt,
      body: text,
    });
    recordUsage(user.id, "writing", call.model, call.usage);
    const result = call.result;

    for (const c of result.corrections) {
      logAttempt({
        userId: user.id,
        kind: "writing",
        correct: false,
        answer: c.original,
        expected: c.corrected,
        tags: [c.tag as Tag],
      });
    }
    if (!result.corrections.length) {
      logAttempt({ userId: user.id, kind: "writing", correct: true, answer: text });
    }

    return NextResponse.json(result);
  } catch (e) {
    /* Queue rather than lose the text — including when the month's budget is
       spent, where the queue drains by itself once the window rolls forward.
       The reason is passed through so the page can say which it was; "we could
       not reach the model" and "you have used this month's budget" call for
       different things from the reader. */
    run(
      "INSERT INTO pending_correction (user_id, prompt, body) VALUES (?, ?, ?)",
      user.id,
      prompt,
      text,
    );
    return NextResponse.json({
      queued: true,
      reason: e instanceof BudgetExceeded ? "budget" : "call-failed",
    });
  }
}

/** GET — drain the offline queue once we're back online. */
export async function GET(req: Request) {
  const user = await activeUser(req);
  if (!user) return unauthorized();
  const pending = all<{ id: number; prompt: string; body: string; created_at: string }>(
    `SELECT id, prompt, body, created_at FROM pending_correction
      WHERE user_id = ? AND resolved_at IS NULL ORDER BY id`,
    user.id,
  );

  if (!aiAvailable(user.id) || !pending.length) {
    return NextResponse.json({ pending: pending.length, resolved: [] });
  }

  const resolved = [];
  for (const p of pending.slice(0, 5)) {
    try {
      const call = await correctWriting({
        userId: user.id,
        level: user.level,
        prompt: p.prompt,
        body: p.body,
      });
      recordUsage(user.id, "writing", call.model, call.usage);
      const result = call.result;
      for (const c of result.corrections) {
        logAttempt({
          userId: user.id,
          kind: "writing",
          correct: false,
          answer: c.original,
          expected: c.corrected,
          tags: [c.tag as Tag],
        });
      }
      run("UPDATE pending_correction SET resolved_at = datetime('now') WHERE id = ?", p.id);
      resolved.push({ id: p.id, written: p.created_at, ...result });
    } catch {
      break;
    }
  }
  return NextResponse.json({ pending: pending.length - resolved.length, resolved });
}
