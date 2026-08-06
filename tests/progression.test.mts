/**
 * Walk a brand-new learner through all 120 units.
 * needs: server, seeded database
 */
import {
  get,
  post,
  ok,
  section,
  done,
  scratchUser,
  nextDay,
  open,
  pageRes,
} from "./harness.mts";

const U = scratchUser("test-progression");

section("a brand-new learner");
let s = await get(`/api/session?user=${U}`);
ok(s.user.level === "A1.1", "starts at A1.1", s.user.level);
ok(s.unit?.id === "a1-1-u01", "starts at the first unit", s.unit?.id);
ok(
  s.unitsInLevel > 0,
  "the unit count comes from the data",
  `of ${s.unitsInLevel}`,
);
ok(
  s.dueTotal === 0,
  "an empty deck has nothing due on day one",
  `due=${s.dueTotal}`,
);
ok(
  s.blocks[0].kind !== "review",
  "the first block is not a review of words never taught",
  `first=${s.blocks[0].kind}`,
);
console.log(
  `      first session: ${s.blocks.map((b: any) => b.kind).join(" ")}`,
);

section("introducing a word puts it in the deck with a real rep");
const newVocab = s.blocks.find((b: any) => b.kind === "new-vocab");
ok(newVocab !== undefined, "new-vocab block present");
const w = newVocab.payload.words[0];
const before = (await get(`/api/review?user=${U}`)).stats;
await post("/api/attempt", {
  user: U,
  kind: "new-vocab",
  refId: w.id,
  correct: true,
  answer: w.en,
  expected: w.en,
});
const after = (await get(`/api/review?user=${U}`)).stats;
ok(
  after.total === before.total + 1,
  "the word entered the deck",
  `${before.total} -> ${after.total} (${w.lemma})`,
);
ok(
  after.reviewedToday >= 1,
  "and it got a real first rep",
  `reps logged=${after.reviewedToday}`,
);

await post("/api/attempt", {
  user: U,
  kind: "new-vocab",
  refId: w.id,
  correct: false,
  answer: "x",
  expected: w.en,
});
const third = (await get(`/api/review?user=${U}`)).stats;
ok(
  third.total === after.total,
  "re-introducing the same word does not duplicate the card",
  third.total,
);

section("walking the whole course");
/* Each unit is learned properly rather than declared done: a unit completes
   only once all its words have been introduced, so the oversized ones
   legitimately need more than one pass. The introductions above already used
   today's allowance, so age them before the first lap. */
nextDay(U);

const seen: string[] = [];
let guard = 0;
while (guard++ < 400) {
  s = await get(`/api/session?user=${U}`);
  if (!s.unit) break;

  const id = `${s.unit.level}/${s.unit.id}`;
  if (seen[seen.length - 1] !== id) seen.push(id);

  const nv = s.blocks.find((b: any) => b.kind === "new-vocab");
  for (const word of nv?.payload.words ?? []) {
    await post("/api/attempt", {
      user: U,
      kind: "new-vocab",
      refId: word.id,
      correct: true,
    });
  }

  const finished = await post("/api/session", {
    user: U,
    minutes: 1,
    blocks: ["quiz"],
    completeUnit: s.unit.id,
  });
  nextDay(U);

  if (!finished.unitDone && !nv) break; // nothing left to do and no way forward
  if (
    s.unit.level === "B1.2" &&
    s.unit.ord === s.unitsInLevel &&
    finished.unitDone
  )
    break;
}

const levelsHit = [...new Set(seen.map((x) => x.split("/")[0]))];
ok(
  levelsHit.join(",") === "A1.1,A1.2,A2.1,A2.2,B1.1,B1.2",
  "the learner reaches every level, in order",
  levelsHit.join(" -> "),
);
ok(
  seen.length === 120,
  "all 120 units are reachable",
  `${seen.length} visited`,
);
ok(new Set(seen).size === seen.length, "no unit is visited twice");
ok(
  guard < 400,
  "the walk terminated rather than hitting the guard",
  `${guard} sessions`,
);

const finalLevel = (await get(`/api/session?user=${U}`)).user.level;
ok(finalLevel === "B1.2", "user.level ends at B1.2", finalLevel);

const perLevel: Record<string, number> = {};
for (const x of seen)
  perLevel[x.split("/")[0]] = (perLevel[x.split("/")[0]] ?? 0) + 1;
console.log(
  "      units per level: " +
    Object.entries(perLevel)
      .map(([k, v]) => `${k}=${v}`)
      .join(" "),
);

section("every word in the course was actually introduced");
/* The walk answers all the vocabulary it is offered, so anything still without
   a rep is a word no session ever put in front of the learner. */
const db = open();
const taught = (
  db
    .prepare(
      "SELECT COUNT(*) n FROM card WHERE user_id = ? AND ref_type = 'word' AND reps > 0",
    )
    .get(U) as { n: number }
).n;
/*
 * Against the words the COURSE teaches, not against every row in the table.
 *
 * This used to ask whether every word had been introduced — true only while
 * every word belonged to a unit, and the reason every word belonged to a unit.
 * Two thousand subtitle-frequency words were padded into units to satisfy it,
 * which is how a beginner unit came to teach "Leiche".
 *
 * Still exact, because a weakened version of this test stops catching an
 * unfinishable course: every word ANY unit teaches must be introduced by a full
 * pass. The denominator changed, not the strictness.
 */
const inUnits = new Set(
  (
    db.prepare("SELECT word_ids_json FROM unit").all() as {
      word_ids_json: string;
    }[]
  ).flatMap((u) => JSON.parse(u.word_ids_json) as string[]),
);
const known = new Set(
  (db.prepare("SELECT id FROM word").all() as { id: string }[]).map(
    (w) => w.id,
  ),
);
const total = [...inUnits].filter((id) => known.has(id)).length;
db.close();
ok(
  taught === total,
  "no word the course teaches is left untaught by a full pass",
  `${taught} of ${total}`,
);
ok(total >= 400, "and the course teaches a real vocabulary", `${total} words`);

section("exam scope follows the level");
const exam = await get(`/api/pruefung?user=${U}`);
ok(
  exam.level === "B1.2",
  "the exam is built at the learner's level",
  exam.level,
);
ok(exam.total > 0, "and has questions", `total=${exam.total}`);

section("Der Weg reflects the walk");
/* The roadmap and milestone page reads unit_progress and the attempt log
   directly rather than through an API, so this is the only place it can be
   checked against a learner who genuinely finished the course. Fetched with a
   cookie because the page identifies the learner the way a browser does. */
const weg = await pageRes("/weg", U);
ok(weg.ok, "the page renders", weg.status);
const html = await weg.text();
ok(html.includes("120 von 120"), "it counts every unit as done");
ok(
  /A1\.1[\s\S]{0,400}fertig/.test(html),
  "and dates the levels that are finished",
);
ok(html.includes("Das kannst du jetzt"), "the can-do list is present");
ok(
  !html.includes("Noch keine abgeschlossene Unit"),
  "and is not showing its empty state",
);
ok(
  html.includes("B1.2 abgeschlossen"),
  "the last level appears as a milestone",
);

done();
