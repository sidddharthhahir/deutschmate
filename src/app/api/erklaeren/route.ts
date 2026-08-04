import { NextResponse } from "next/server";
import { activeUser } from "@/lib/user";
import { readJson, badRequest, unauthorized } from "@/lib/http";
import { explainSentence, aiAvailable } from "@/lib/ai";
import { recordUsage } from "@/lib/cost";
import { findExplanation, saveExplanation } from "@/lib/shared-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Erklär mir das" — a grammar breakdown of any sentence in the app.
 *
 * Same three-tier shape as mistake explanations (spec §12):
 *   1. cache hit    free, instant, offline
 *   2. model call   only on a miss, on the cheap model
 *   3. stored       so the second person to ask gets tier 1
 *
 * Shared for the app's own sentences — you and your flatmate read the same 38
 * texts, so half of these are answered before either of you asks. Private for
 * anything else, because /text takes whatever German you paste and some of it
 * is nobody else's business. lib/shared-cache.ts decides which, from the
 * database rather than from the request.
 */

export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(req, raw);
  if (!user) return unauthorized();

  // Read the raw length before truncating, so an over-long sentence is
  // refused rather than silently cut in half and explained wrongly.
  const given = typeof raw.sentence === "string" ? raw.sentence.trim() : "";
  if (!given || given.length > 400) {
    return badRequest("sentence required (max 400 chars)");
  }
  const sentence = given;

  const hit = findExplanation(sentence, user.level, user.id);
  if (hit) {
    return NextResponse.json({
      ok: true,
      explanation: hit.body_md,
      source: "cache",
      shared: hit.shared,
    });
  }

  if (!aiAvailable(user.id)) {
    // Honest empty-handed answer rather than a fabricated one. Nothing in the
    // app is allowed to depend on this call succeeding (spec §17).
    return NextResponse.json({
      ok: false,
      reason: "offline",
      explanation: null,
    });
  }

  try {
    const { result: md, model, usage } = await explainSentence(
      user.id,
      sentence,
      user.level,
    );
    recordUsage(user.id, "explain", model, usage);
    const shared = saveExplanation(sentence, user.level, user.id, md);
    return NextResponse.json({ ok: true, explanation: md, source: "model", shared });
  } catch {
    return NextResponse.json({ ok: false, reason: "failed", explanation: null });
  }
}
