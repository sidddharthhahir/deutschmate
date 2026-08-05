/**
 * Old scenarios and readings come back.
 * needs: server, seeded database
 */
import { get, ok, section, done, scratchUser, open } from "./harness.mts";
import { rhythmFor, today } from "../src/lib/rhythm.ts";

/* The input rotation has two slots without video and three with, which shifts
   which day is a reading day. Read it rather than assuming, so importing a
   segmented video does not quietly make this test wrong. */
function hasSegmentedVideo(): boolean {
  const d = open();
  const rows = d.prepare("SELECT segments_json FROM video").all() as {
    segments_json: string;
  }[];
  d.close();
  return rows.some((r) => {
    try {
      return (JSON.parse(r.segments_json) as unknown[]).length > 0;
    } catch {
      return false;
    }
  });
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
db2.close();

/*
 * Which slot fires today is fixed by the calendar, and the day index comes from the wall clock — a
 * request can only ever observe today.
 */
const expected = rhythmFor(today(), {
  video: hasSegmentedVideo(),
  reading: true,
});
const shouldRecycle = expected.recycleReading || expected.recycleScenario;

const plan = await get(`/api/session?user=${U}`);
const recycled = plan.blocks.filter((b: any) => b.payload?.from);
const titles = plan.blocks.map((b: any) => b.title).join(" ");

ok(
  shouldRecycle ? recycled.length > 0 : recycled.length === 0,
  shouldRecycle
    ? "today is a revisit day, and today's session revisits something"
    : "today is not a revisit day, and nothing is dressed up as one",
  `day ${today()} · reading=${expected.recycleReading} scenario=${expected.recycleScenario} · ${titles}`,
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
