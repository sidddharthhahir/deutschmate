/**
 * Old scenarios and readings come back.
 * needs: server, seeded database
 */
import { get, ok, section, done, scratchUser, open } from "./harness.mts";
import { rhythmFor, today } from "../src/lib/rhythm.ts";

/*
 * The input rotation has two slots without video and three with, which shifts
 * which day is a reading day. Read it rather than assuming.
 *
 * This used to ask whether ANY video had hand-marked segments, because that was
 * once the rule for offering one. It is not any more — a linked episode plays
 * whether or not its sentences are marked up — so availability is now what
 * buildSession asks: does THIS learner's unit have a video with a source.
 */
function unitHasVideo(unitId: string): boolean {
  const d = open();
  const row = d
    .prepare(
      `SELECT v.src_url, v.youtube_id FROM unit u
         JOIN video v ON v.id = u.video_id WHERE u.id = ?`,
    )
    .get(unitId) as
    { src_url: string | null; youtube_id: string | null } | undefined;
  d.close();
  return Boolean(row && (row.src_url ?? row.youtube_id));
}

const U = scratchUser("test-recycle");
await get(`/api/session?user=${U}`); // create the user

section("nothing to revisit on day one");
const fresh = await get(`/api/session?user=${U}`);
const freshTitles = fresh.blocks.map((b: any) => b.title);
ok(
  !freshTitles.includes("Wiederlesen"),
  "no recycled reading",
  freshTitles.join(" "),
);
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

/*
 * Which slot fires today is fixed by the calendar, and the day index comes from the wall clock — a
 * request can only ever observe today.
 */
const plan = await get(`/api/session?user=${U}`);
const expected = rhythmFor(today(), {
  video: unitHasVideo(plan.unit?.id ?? ""),
  reading: true,
});
/*
 * Only count a revisit the learner could actually be given. The rotation asks
 * for a recycled SCENARIO one day in three, and no A1 unit has one — all
 * twenty scenarios start at A2.1 — so on that day an A1 learner correctly gets
 * nothing back. Asserting otherwise made this test fail for a content gap
 * rather than for a bug, which is a test blaming the wrong thing.
 */
const oldScenarios = (
  db2
    .prepare(
      `SELECT COUNT(*) AS n FROM unit_progress p JOIN unit u ON u.id = p.unit_id
        WHERE p.user_id = ? AND u.scenario_json IS NOT NULL`,
    )
    .get(U) as { n: number }
).n;
const shouldRecycle =
  expected.recycleReading || (expected.recycleScenario && oldScenarios > 0);
db2.close();

const recycled = plan.blocks.filter((b: any) => b.payload?.from);
const titles = plan.blocks.map((b: any) => b.title).join(" ");

/*
 * One direction only. A revisit can also happen for a second reason the
 * rotation knows nothing about: most A1 units have no text of their own, so a
 * reading day borrows one from an older unit. Asserting the reverse would make
 * that correct behaviour a failure.
 */
if (shouldRecycle)
  ok(
    recycled.length > 0,
    "today is a revisit day, and today's session revisits something",
    `day ${today()} · reading=${expected.recycleReading} scenario=${expected.recycleScenario} · ${titles}`,
  );
else
  console.log(
    `      (not a revisit day by the rotation — ${titles}. Anything revisited\n` +
      `       anyway is still checked below, so nothing is asserted here.)`,
  );

/* The block checks below only run on a revisit day. */
const kinds = plan.blocks.map((b: any) => b.kind);
ok(
  kinds.includes(expected.input),
  "the input block is the one the rotation asked for",
  `expected ${expected.input}, got ${kinds.join(" ")}`,
);
ok(
  kinds.includes(expected.output),
  "and so is the output block",
  `expected ${expected.output}, got ${kinds.join(" ")}`,
);
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
    ok(
      typeof b.payload.body === "string" && b.payload.body.length > 50,
      "the old text is actually loaded",
      `${b.payload.wordCount} Wörter`,
    );
  }
  if (b.kind === "conversation") {
    ok(
      !!b.payload.scenario?.role && !!b.payload.scenario?.goal,
      "the old scene is actually loaded",
      b.payload.scenario?.role,
    );
    ok(
      b.payload.unitId !== plan.unit?.id,
      "and it is a different unit from today's",
      `${b.payload.unitId} vs ${plan.unit?.id}`,
    );
  }
}

done();
