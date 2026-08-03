/**
 * A unit holding more words than a day allows must carry over, not lose them.
 *
 * Units are not all twelve words. When a 22-word unit was marked complete after
 * one session, ten words were dropped and nothing said so — the learner saw
 * "Einheit fertig" and moved on. This checks the remainder comes back.
 *
 * needs: server, seeded database
 */
import { get, post, ok, section, done, scratchUser, nextDay, open } from "./harness.mts";

const U = scratchUser("test-carryover");
await get(`/api/session?user=${U}`); // create the user

const db = open();
const units = db
  .prepare("SELECT id, ord, word_ids_json FROM unit WHERE level = 'A1.1' ORDER BY ord")
  .all() as { id: string; ord: number; word_ids_json: string }[];

const target = units.find((u) => (JSON.parse(u.word_ids_json) as string[]).length > 12);
if (!target) {
  console.log("SKIP  no A1.1 unit is larger than one day's vocabulary");
  db.close();
  done();
}
const wordIds = JSON.parse(target.word_ids_json) as string[];
const size = wordIds.length;
console.log(`      target: A1.1 unit ${target.ord}, ${size} words`);

// Complete everything before it so the learner lands on it.
const mark = db.prepare(
  `INSERT INTO unit_progress (user_id, unit_id, status, completed_at)
   VALUES (?, ?, 'complete', datetime('now'))
   ON CONFLICT(user_id, unit_id) DO UPDATE SET status = 'complete'`,
);
for (const u of units) {
  if (u.ord >= target.ord) break;
  mark.run(U, u.id);
}
db.close();

section("day one");
const s1 = await get(`/api/session?user=${U}`);
ok(s1.unit.id === target.id, "landed on the oversized unit", `unit ${s1.unit.ord}`);
const nv = s1.blocks.find((b: any) => b.kind === "new-vocab");
ok(nv?.payload.words.length === 12, "twelve words offered today", nv?.payload.words.length);

for (const w of nv.payload.words) {
  await post("/api/attempt", { user: U, kind: "new-vocab", refId: w.id, correct: true });
}
const done1 = await post("/api/session", {
  user: U, minutes: 30, blocks: ["new-vocab"], completeUnit: target.id,
});
ok(done1.unitDone === false, "the unit is NOT marked complete yet", `wordsLeft=${done1.wordsLeft}`);
ok(done1.wordsLeft === size - 12, "the remainder is reported honestly", `${done1.wordsLeft} of ${size}`);

section("day two");
nextDay(U);
const s2 = await get(`/api/session?user=${U}`);
ok(s2.unit.id === target.id, "the same unit comes back", `unit ${s2.unit.ord}`);
const nv2 = s2.blocks.find((b: any) => b.kind === "new-vocab");
ok(nv2?.payload.words.length === size - 12, "and only the leftovers are offered",
  nv2?.payload.words.length);

for (const w of nv2.payload.words) {
  await post("/api/attempt", { user: U, kind: "new-vocab", refId: w.id, correct: true });
}
const done2 = await post("/api/session", {
  user: U, minutes: 30, blocks: ["new-vocab"], completeUnit: target.id,
});
ok(done2.unitDone === true, "now the unit completes", `wordsLeft=${done2.wordsLeft}`);

const s3 = await get(`/api/session?user=${U}`);
ok(s3.unit.ord === target.ord + 1, "and it moves on", `unit ${s3.unit.ord}`);

section("nothing was skipped");
const db2 = open();
const introduced = (
  db2.prepare(
    `SELECT COUNT(*) n FROM card WHERE user_id = ? AND ref_type = 'word' AND reps > 0
      AND ref_id IN (${wordIds.map(() => "?").join(",")})`,
  ).get(U, ...wordIds) as { n: number }
).n;
db2.close();
ok(introduced === size, "every word in the unit was actually introduced", `${introduced} of ${size}`);

done();
