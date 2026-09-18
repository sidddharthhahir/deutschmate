import { NextResponse } from "next/server";
import { activeUser } from "@/lib/user";
import { readJson, str, badRequest, unauthorized } from "@/lib/http";
import { trackEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The only two events with no server-side moment to hang off already:
 * lesson_started (the session page finished loading its queue) and
 * scenario_completed (a roleplay — course unit or Alltag — ran to the end).
 * Every other tracked event fires from inside the route that already owns
 * that moment. Allow-listed rather than a free-form event logger.
 */
const ALLOWED = new Set(["lesson_started", "scenario_completed"]);

export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(req, raw);
  if (!user) return unauthorized();

  const event = str(raw.event, 40);
  if (!ALLOWED.has(event)) return badRequest("unknown event");

  const properties =
    raw.properties && typeof raw.properties === "object"
      ? (raw.properties as Record<string, unknown>)
      : {};

  trackEvent(user.id, event, properties);
  return NextResponse.json({ ok: true });
}
