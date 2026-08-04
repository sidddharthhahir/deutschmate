/**
 * Old scenarios and readings come back.
 *
 * Words and grammar rules were on a forgetting curve; situations were not. You
 * did the café in unit 8 and never saw it again — which is backwards, because a
 * ten-minute conversation is the slowest thing in the course to build and the
 * fastest to lose.
 *
 * The failure this guards against is silence: a rotation that quietly never
 * fires looks exactly like the old behaviour, and nothing on screen would say
 * so. So the checks below drive the session builder across a run of days and
 * assert the old material actually appears, with its origin named.
 *
 * needs: server, seeded database
 */
import { get, ok, section, done, scratchUser, open } from "./harness.mts";

const U = scratchUser("test-recycle");
await get(`/api/session?user=${U}`); // create the user

section("nothing to revisit on day one");
const fresh = await get(`/api/session?user=${U}`);
const freshTitles = fresh.blocks.map((b: any) => b.title);
ok(!freshTitles.includes("Wiederlesen"), "no recycled reading", freshTitles.join(" "));
ok(!freshTitles.includes("Nochmal sprechen"), "no recycled conversation");

section("a unit finished yesterday is not revision");
/* Backdating by one day only. The seven-day floor exists because redoing
   yesterday's scene is the same lesson, not a second pass at it. */
const db = open();
const early = db
  .prepare("SELECT id FROM unit WHERE level = 'A1.1' ORDER BY ord LIMIT 4")
  .all() as { id: string }[];
const mark = db.prepare(
  `INSERT INTO unit_progress (user_id, unit_id, status, completed_at)
   VALUES (?, ?, 'complete', datetime('now', ?))
   ON CONFLICT(user_id, unit_id) DO UPDATE SET completed_at = excluded.completed_at`,
);
for (const u of early) mark.run(U, u.id, "-1 days");
db.close();

const tooSoon = await get(`/api/session?user=${U}`);
ok(
  !tooSoon.blocks.some((b: any) => b.payload?.from),
  "still nothing recycled",
  tooSoon.blocks.map((b: any) => b.title).join(" "),
);

section("older units do come back");
const db2 = open();
const mark2 = db2.prepare(
  `INSERT INTO unit_progress (user_id, unit_id, status, completed_at)
   VALUES (?, ?, 'complete', datetime('now', '-30 days'))
   ON CONFLICT(user_id, unit_id) DO UPDATE SET completed_at = datetime('now','-30 days')`,
);
const many = db2
  .prepare("SELECT id FROM unit WHERE level = 'A1.1' ORDER BY ord LIMIT 10")
  .all() as { id: string }[];
for (const u of many) mark2.run(U, u.id);
db2.close();

/* Which slot fires today is fixed by the calendar, and the day index comes
   from the wall clock — so a request can only ever observe today. Whether the
   rotation is *correctly proportioned* is rhythm.test.mts's job, walking a
   month of pure day indices. What this can check, and what that cannot, is
   that the wiring behind whichever slot fires today actually resolves a real
   past unit and labels it. */
const plan = await get(`/api/session?user=${U}`);
const recycled = plan.blocks.filter((b: any) => b.payload?.from);
const titles = plan.blocks.map((b: any) => b.title).join(" ");

ok(recycled.length > 0, "today's session revisits something", titles);
for (const b of recycled) {
  ok(
    /^Unit \d+ · .+/.test(b.payload.from),
    "and names where it came from, in a form the learner can place",
    `${b.title}: ${b.payload.from}`,
  );
  ok(
    b.title === "Wiederlesen" || b.title === "Nochmal sprechen",
    "under a title that says it is a revisit",
    b.title,
  );
}

section("a revisited block is a real one, not a stub");
for (const b of recycled) {
  if (b.kind === "reading") {
    ok(typeof b.payload.body === "string" && b.payload.body.length > 50,
      "the old text is actually loaded", `${b.payload.wordCount} Wörter`);
  }
  if (b.kind === "conversation") {
    ok(!!b.payload.scenario?.role && !!b.payload.scenario?.goal,
      "the old scene is actually loaded", b.payload.scenario?.role);
    ok(b.payload.unitId !== plan.unit?.id,
      "and it is a different unit from today's", `${b.payload.unitId} vs ${plan.unit?.id}`);
  }
}

done();
