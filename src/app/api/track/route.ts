import { NextResponse } from "next/server";
import { activeUser } from "@/lib/user";
import { readJson, str, badRequest, unauthorized } from "@/lib/http";
import { trackEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Events with no server-side moment to hang off already — lesson_started
 * (the session page finished loading its queue), scenario_completed (a
 * roleplay ran to the end), and the personalization events that only the
 * client knows it actually rendered (personalization_name_used,
 * recommendation_shown, personalized_variant_shown,
 * error_driven_review_shown). Every other tracked event fires from inside
 * the route that already owns that moment. Allow-listed rather than a
 * free-form event logger.
 *
 * `properties` is allow-listed too, per event — this is a public POST route,
 * so without it a client could attach any JSON it liked to `event.properties_json`,
 * including arbitrary free text. Analytics for THIS app means a handful of
 * short, known-shape fields (an id, an enum-like word), never prose, so the
 * allow-list costs nothing legitimate and closes an open write.
 *
 * None of the personalization events carry the learner's name or the actual
 * rendered variant text — only which situation/category/tag drove the
 * choice, never what was shown.
 */
const ALLOWED: Record<string, readonly string[]> = {
  lesson_started: ["unitId", "shape"],
  scenario_completed: ["scenarioId", "source", "mode"],
  personalization_name_used: ["location"],
  recommendation_shown: ["situation"],
  personalized_variant_shown: ["category", "unitId"],
  error_driven_review_shown: ["tag"],
};

/** A short string, a short number, or null — never an object, array, or essay. */
function cleanValue(v: unknown): string | number | null {
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") return v.slice(0, 80);
  return null;
}

export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(req, raw);
  if (!user) return unauthorized();

  const event = str(raw.event, 40);
  const allowedKeys = ALLOWED[event];
  if (!allowedKeys) return badRequest("unknown event");

  const given =
    raw.properties && typeof raw.properties === "object"
      ? (raw.properties as Record<string, unknown>)
      : {};
  const properties: Record<string, string | number | null> = {};
  for (const key of allowedKeys) {
    if (key in given) properties[key] = cleanValue(given[key]);
  }

  trackEvent(user.id, event, properties);
  return NextResponse.json({ ok: true });
}
