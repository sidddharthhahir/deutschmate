/**
 * trackEvent() and the two client-only events it backs.
 * needs: server
 */
import { get, post, raw, ok, eq, section, done, scratchUser, open } from "./harness.mts";
import { trackEvent } from "../src/lib/analytics.ts";

const U = scratchUser("test-analytics");
await get(`/api/session?user=${U}`); // create the user

section("trackEvent writes a row with the shape the table expects");
trackEvent(U, "test_event", { foo: "bar", n: 3 });
const db = open();
const row = db
  .prepare(
    "SELECT event_name, properties_json FROM event WHERE user_id = ? ORDER BY id DESC LIMIT 1",
  )
  .get(U) as { event_name: string; properties_json: string } | undefined;
db.close();
ok(row !== undefined, "a row landed");
eq(row?.event_name, "test_event", "with the right name");
eq(
  JSON.parse(row?.properties_json ?? "{}"),
  { foo: "bar", n: 3 },
  "and the right properties",
);

section("a missing user never throws");
let threw = false;
try {
  trackEvent(null, "test_event", {});
  trackEvent(undefined, "test_event", {});
} catch {
  threw = true;
}
ok(!threw, "trackEvent(null, ...) is a silent no-op");

section("POST /api/track only accepts the allow-listed client events");
const started = await post(`/api/track?user=${U}`, {
  event: "lesson_started",
  properties: { unitId: "a1-1-u01" },
});
ok(started.ok, "lesson_started is accepted", JSON.stringify(started));

const unknown = await post(`/api/track?user=${U}`, {
  event: "made_up_event",
  properties: {},
});
ok(!unknown.ok, "an unlisted event name is refused");

const anon = await raw("/api/track", {
  method: "POST",
  body: JSON.stringify({ event: "lesson_started" }),
});
eq(anon.status, 401, "signed out cannot log an event either");

done();
