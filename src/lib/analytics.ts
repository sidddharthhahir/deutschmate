import { run } from "./db.ts";

/**
 * First-party event tracking (schema.sql's `event` table). No third-party
 * dependency, no dashboard — just a row per event, so questions like "did the
 * onboarding change anything" can be answered with SQL against this app's own
 * database instead of a guess.
 *
 * Query examples, run against deutschmate.db (sqlite3 deutschmate.db):
 *
 *   -- events per day, this week
 *   SELECT date(created_at), event_name, COUNT(*)
 *     FROM event WHERE created_at > datetime('now','-7 days')
 *     GROUP BY 1, 2 ORDER BY 1;
 *
 *   -- a single user's timeline
 *   SELECT created_at, event_name, properties_json
 *     FROM event WHERE user_id = 'mira' ORDER BY created_at;
 *
 *   -- one property out of the JSON blob (SQLite's json1, built in)
 *   SELECT json_extract(properties_json, '$.situation') AS situation,
 *          COUNT(*)
 *     FROM event WHERE event_name = 'goal_selected' GROUP BY 1;
 *
 * Never track message contents, API keys, passwords or other sensitive
 * values in `properties` — ids, counts and short enums only.
 */
export function trackEvent(
  userId: string | null | undefined,
  eventName: string,
  properties: Record<string, unknown> = {},
) {
  if (!userId) return; // nobody signed in — nothing to attribute this to
  try {
    run(
      "INSERT INTO event (user_id, event_name, properties_json) VALUES (?, ?, ?)",
      userId,
      eventName,
      JSON.stringify(properties),
    );
  } catch {
    // Analytics must never be the reason a real feature fails.
  }
}
