import { NextResponse } from "next/server";
import { activeUser, setSituation } from "@/lib/user";
import { readJson, str, unauthorized } from "@/lib/http";
import { isSituation } from "@/lib/situation";
import { trackEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The one onboarding question. A missing or unrecognised value is a skip, not
 * an error — the question is never a gate (spec principle: never fake a
 * choice as required when it isn't).
 */
export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(req, raw);
  if (!user) return unauthorized();

  const value = str(raw.situation, 40);
  const situation = isSituation(value) ? value : null;

  setSituation(user.id, situation);
  trackEvent(user.id, "onboarding_completed", { skipped: situation === null });
  if (situation) trackEvent(user.id, "goal_selected", { situation });

  return NextResponse.json({ ok: true, situation });
}
