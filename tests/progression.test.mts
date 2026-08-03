/**
 * Walk a brand-new learner through all 120 units.
 *
 * This is the test that matters most. Nothing in the app reports "the learner
 * cannot get past A1.1" — the home page just keeps offering unit 1 forever,
 * which is exactly what happened when nothing set `user.level`. The only way
 * to know the course is finishable is to finish it.
 *
 * needs: server, seeded database
 */
import { get, post, ok, section, done, scratchUser, nextDay, open } from "./harness.mts";

const U = scratchUser("test-progression");

section("a brand-new learner");
let s = await get(`/api/session?user=${U}`);
ok(s.user.level === "A1.1", "starts at A1.1", s.user.level);
ok(s.unit?.id === "a1-1-u01", "starts at the first unit", s.unit?.id);
ok(s.unitsInLevel > 0, "the unit count comes from the data", `of ${s.unitsInLevel}`);
ok(s.dueTotal === 0, "an empty deck has nothing due on day one", `due=${s.dueTotal}`);
ok(s.blocks[0].kind !== "review",
  "the first block is not a review of words never taught", `first=${s.blocks[0].kind}`);
console.log(`      first session: ${s.blocks.map((b: any) => b.kind).join(" ")}`);

section("introducing a word puts it in the deck with a real rep");
const newVocab = s.blocks.find((b: any) => b.kind === "new-vocab");
ok(newVocab !== undefined, "new-vocab block present");
const w = newVocab.payload.words[0];
const before = (await get(`/api/review?user=${U}`)).stats;
await post("/api/attempt", { user: U, kind: "new-vocab", refId: w.id, correct: true, answer: w.en, expected: w.en });
const after = (await get(`/api/review?user=${U}`)).stats;
ok(after.total === before.total + 1, "the word entered the deck",
  `${before.total} -> ${after.total} (${w.lemma})`);
ok(after.reviewedToday >= 1, "and it got a real first rep", `reps logged=${after.reviewedToday}`);

await post("/api/attempt", { user: U, kind: "new-vocab", refId: w.id, correct: false, answer: "x", expected: w.en });
const third = (await get(`/api/review?user=${U}`)).stats;
ok(third.total === after.total, "re-introducing the same word does not duplicate the card", third.total);

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
    await post("/api/attempt", { user: U, kind: "new-vocab", refId: word.id, correct: true });
  }

  const finished = await post("/api/session", {
    user: U, minutes: 1, blocks: ["quiz"], completeUnit: s.unit.id,
  });
  nextDay(U);

  if (!finished.unitDone && !nv) break; // nothing left to do and no way forward
  if (s.unit.level === "B1.2" && s.unit.ord === s.unitsInLevel && finished.unitDone) break;
}

const levelsHit = [...new Set(seen.map((x) => x.split("/")[0]))];
ok(levelsHit.join(",") === "A1.1,A1.2,A2.1,A2.2,B1.1,B1.2",
  "the learner reaches every level, in order", levelsHit.join(" -> "));
ok(seen.length === 120, "all 120 units are reachable", `${seen.length} visited`);
ok(new Set(seen).size === seen.length, "no unit is visited twice");
ok(guard < 400, "the walk terminated rather than hitting the guard", `${guard} sessions`);

const finalLevel = (await get(`/api/session?user=${U}`)).user.level;
ok(finalLevel === "B1.2", "user.level ends at B1.2", finalLevel);

const perLevel: Record<string, number> = {};
for (const x of seen) perLevel[x.split("/")[0]] = (perLevel[x.split("/")[0]] ?? 0) + 1;
console.log("      units per level: " + Object.entries(perLevel).map(([k, v]) => `${k}=${v}`).join(" "));

section("every word in the course was actually introduced");
/* The walk answers all the vocabulary it is offered, so anything still without
   a rep is a word no session ever put in front of the learner. */
const db = open();
const taught = (
  db.prepare(
    "SELECT COUNT(*) n FROM card WHERE user_id = ? AND ref_type = 'word' AND reps > 0",
  ).get(U) as { n: number }
).n;
const total = (db.prepare("SELECT COUNT(*) n FROM word").get() as { n: number }).n;
db.close();
ok(taught === total, "no word is left untaught by a full pass", `${taught} of ${total}`);

section("exam scope follows the level");
const exam = await get(`/api/pruefung?user=${U}`);
ok(exam.level === "B1.2", "the exam is built at the learner's level", exam.level);
ok(exam.total > 0, "and has questions", `total=${exam.total}`);

done();
