/**
 * The session's rotation, walked across a month.
 *
 * These are the decisions that used to be `dayIndex % 3` expressions inside
 * buildSession, where they could not be checked: the day index comes from the
 * wall clock, so a test could only ever observe today. A rotation that quietly
 * never fires looks exactly like the old behaviour, and nothing on screen says
 * so — a whole skill can go missing for weeks without a single failing check.
 *
 * needs: nothing
 */
import { rhythmFor, today, type Available } from "../src/lib/rhythm.ts";
import { ok, eq, section, done } from "./harness.mts";

const FULL: Available = { video: true, reading: true };
const NO_VIDEO: Available = { video: false, reading: true };
const NOTHING: Available = { video: false, reading: false };

/** Walk a month and count how often each choice comes up. */
function over(days: number, has: Available) {
  const n = {
    audio: 0, video: 0, reading: 0, listening: 0,
    recycleReading: 0, speaking: 0, writing: 0, recycleScenario: 0,
  };
  for (let d = 0; d < days; d++) {
    const r = rhythmFor(d, has);
    if (r.audioFirstReview) n.audio++;
    n[r.input]++;
    if (r.recycleReading) n.recycleReading++;
    n[r.output]++;
    if (r.recycleScenario) n.recycleScenario++;
  }
  return n;
}

section("the same day always gives the same session");
/* Deterministic, never random: reloading the page mid-session must not hand
   you a different one. */
eq(rhythmFor(20_400, FULL), rhythmFor(20_400, FULL), "identical for one day index");
ok(
  JSON.stringify(rhythmFor(20_400, FULL)) !== JSON.stringify(rhythmFor(20_401, FULL)),
  "and different the next day",
);

section("speaking outweighs writing");
/* Speaking used to take one slot of three with the third left empty, so a
   learner spoke aloud on a third of their days — the one output skill that
   costs nothing per use, in a course whose premise is self-study. */
const m = over(30, FULL);
eq(m.speaking, 20, "20 speaking days a month");
eq(m.writing, 10, "10 writing days");
ok(m.speaking + m.writing === 30, "and never a day with neither",
  `${m.speaking} + ${m.writing}`);

section("every input kind gets a turn");
eq(m.video + m.reading + m.listening, 30, "one input block a day");
ok(m.video > 0 && m.reading > 0 && m.listening > 0, "all three appear",
  `video ${m.video} · reading ${m.reading} · listening ${m.listening}`);

section("old material comes back");
ok(m.recycleScenario === 10, "a past conversation every third day", m.recycleScenario);
ok(m.recycleReading > 0, "and a past reading regularly", m.recycleReading);
ok(m.recycleReading < m.reading, "but not every reading day — new texts still land",
  `${m.recycleReading} of ${m.reading}`);

section("a recycled reading is only ever chosen on a reading day");
for (let d = 0; d < 60; d++) {
  const r = rhythmFor(d, FULL);
  if (r.recycleReading && r.input !== "reading") {
    ok(false, `day ${d} recycles a reading without a reading slot`);
    break;
  }
  if (d === 59) ok(true, "checked 60 days");
}

section("degrades when content is missing");
/* No video authored yet — the real state of this install, since no video has
   timestamps. Reading must take the slot rather than the day silently
   collapsing to listening every time. */
const nv = over(30, NO_VIDEO);
eq(nv.video, 0, "no video block when none is ready");
ok(nv.reading === 15 && nv.listening === 15, "reading and listening split the days",
  `reading ${nv.reading} · listening ${nv.listening}`);

const none = over(30, NOTHING);
eq(none.listening, 30, "with neither, every day is listening");
eq(none.recycleReading, 0, "and nothing pretends to recycle a reading");
ok(none.speaking + none.writing === 30, "output still rotates regardless of input");

section("audio-first reviews");
eq(m.audio, 10, "a third of days hide the word until you answer");

section("today() reads the clock, and only here");
eq(today(0), 0, "epoch is day zero");
eq(today(86_400_000), 1, "one day later is day one");
eq(today(86_400_000 * 20_000 + 500), 20_000, "and it floors within the day");

done();
