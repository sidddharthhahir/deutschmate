/**
 * The two spec §7 rules that were written down and never built.
 *
 * **Mastery** — "a unit is complete at ≥80% of its words learned". Built, but
 * deliberately NOT as a gate on completion: `currentUnit()` returns the first
 * unfinished unit, so a retention threshold there parks the learner on unit 1
 * for the fortnight FSRS takes to reach `state = 2`. No new words, no new
 * grammar, nothing but reviews — the exact week people quit in. Coverage
 * drives progression; retention drives what the app says about you.
 *
 * **Prerequisites** — `prereq_json` sat on every unit row, correct, and was
 * read nowhere. Now read. Today the data agrees with `ord` order exactly, so
 * the tests that matter are the ones proving it *would* be obeyed if it
 * didn't, and that bad data cannot strand anyone.
 *
 * needs: server, seeded database
 */
import { get, post, ok, section, done, scratchUser, open, BASE } from "./harness.mts";

/**
 * How many units Der Weg says are actually sticking, read off the page.
 *
 * Through the rendered page rather than a helper, because there is no API for
 * this and adding one only so a test could call it would be surface the app
 * does not otherwise need. The string checked is the one the learner reads.
 */
async function sitzen(): Promise<number> {
  const res = await fetch(`${BASE}/weg`, { headers: { Cookie: `dm_user=${U}` } });
  const html = await res.text();
  const m = html.match(/davon (\d+) wirklich sitzend/);
  return m ? Number(m[1]) : -1;
}

/** The percentage Der Weg reports for one unit, from its tick's tooltip. */
async function pctFor(unitId: string, ord: number): Promise<number> {
  const res = await fetch(`${BASE}/weg`, { headers: { Cookie: `dm_user=${U}` } });
  const html = await res.text();
  const m = html.match(new RegExp(`Unit ${ord} · [^"]*?— (\\d+)% der Wörter sitzen`));
  return m ? Number(m[1]) : -1;
}

const U = scratchUser("test-mastery");
await get(`/api/session?user=${U}`);

const db = open();
const unit = db
  .prepare("SELECT id, ord, word_ids_json, grammar_id FROM unit WHERE level='A1.1' ORDER BY ord LIMIT 1")
  .get() as { id: string; ord: number; word_ids_json: string; grammar_id: string | null };
const words = JSON.parse(unit.word_ids_json) as string[];
db.close();

section("finishing a unit does not mean mastering it");
/* Introduce every word — one rep each. The unit is covered and completable,
   and nothing is learned yet by the app's own definition (reps >= 3, state 2). */
for (const id of words) {
  await post("/api/attempt", { user: U, kind: "new-vocab", refId: id, correct: true });
}
const fin = await post("/api/session", {
  user: U,
  minutes: 30,
  blocks: ["new-vocab"],
  completeUnit: unit.id,
});
ok(fin.unitDone === true, "the unit completes on coverage", `wordsLeft=${fin.wordsLeft}`);

ok((await sitzen()) === 0, "Der Weg counts nothing as sticking yet", `${await sitzen()} sitzen`);
ok((await pctFor(unit.id, unit.ord)) === 0, "0% of its words are learned",
  `${await pctFor(unit.id, unit.ord)}%`);

section("progression is never blocked by retention");
/* The failure mode this whole design exists to avoid. With nothing learned,
   the learner must still be handed the next unit. */
const after = await get(`/api/session?user=${U}`);
ok(after.unit?.id !== unit.id, "the next unit is offered immediately", after.unit?.id);
ok(after.unit?.ord === unit.ord + 1, "and it is the next one in order", after.unit?.ord);

section("mastery arrives when the words actually stick");
/* Push the cards to the state the rest of the app calls "learned". Doing it
   directly rather than through three weeks of grading is the point — this
   asserts the threshold, not FSRS. */
const db2 = open();
const learn = db2.prepare(
  `UPDATE card SET reps = 3, state = 2
    WHERE user_id = ? AND ref_type = 'word' AND ref_id = ?`,
);
const enough = Math.ceil(words.length * 0.8);
for (const id of words.slice(0, enough)) learn.run(U, id);
if (unit.grammar_id) {
  db2
    .prepare(
      `INSERT INTO card (user_id, ref_type, ref_id, due, reps, state)
       VALUES (?, 'grammar', ?, datetime('now','+9 days'), 3, 2)
       ON CONFLICT(user_id, ref_type, ref_id) DO UPDATE SET reps = 3, state = 2`,
    )
    .run(U, unit.grammar_id);
}
db2.close();

ok((await sitzen()) === 1, "at 80% Der Weg counts it as sticking", `${await sitzen()} sitzen`);
ok((await pctFor(unit.id, unit.ord)) >= 80, "and reports the real share",
  `${await pctFor(unit.id, unit.ord)}%`);

section("and it goes away again when they slip");
/* Mastery is computed, never stored, precisely because it can regress. A
   stored flag would keep claiming the unit is solid after the words drained
   away — a number about the past presented as a number about now. */
const db3 = open();
db3
  .prepare(
    `UPDATE card SET state = 3
      WHERE user_id = ? AND ref_type = 'word' AND ref_id IN (${words
        .slice(0, Math.ceil(words.length * 0.5))
        .map(() => "?")
        .join(",")})`,
  )
  .run(U, ...words.slice(0, Math.ceil(words.length * 0.5)));
db3.close();

ok((await sitzen()) === 0, "lapsing drops it back below the line", `${await sitzen()} sitzen`);
const stillDone = await get(`/api/session?user=${U}`);
ok(stillDone.unit?.id !== unit.id, "but the unit is still finished — coverage does not regress",
  `now on ${stillDone.unit?.id}`);

section("prerequisites are read — and on a linear course cannot bite");
/* Worth being exact about what this buys, because it is easy to oversell.
   Today every unit requires exactly the one before it, and units can only be
   completed in that order, so "first unit whose prerequisites are met" and
   "first unfinished unit" are provably the same unit. The check changes no
   outcome. It is a guarantee that the data wins if the two ever disagree, and
   it stops `prereq_json` being 120 rows nothing reads.

   To observe the mechanism at all the data has to stop being a chain. Unit 2
   is gated on a far-off unit AND unit 3 is rewired to depend on unit 1 — so
   unit 3 is genuinely available while unit 2 is not. Restored afterwards. */
const db4 = open();
const [second, third, far] = db4
  .prepare("SELECT id, ord, prereq_json FROM unit WHERE level='A1.1' AND ord IN (2,3,9) ORDER BY ord")
  .all() as { id: string; ord: number; prereq_json: string }[];
const setPrereq = db4.prepare("UPDATE unit SET prereq_json = ? WHERE id = ?");
setPrereq.run(JSON.stringify([far.id]), second.id);
setPrereq.run(JSON.stringify(["a1-1-u01"]), third.id);
db4.close();

const gated = await get(`/api/session?user=${U}`);
ok(gated.unit?.id === third.id, "the gated unit is skipped and the available one is taken",
  `${gated.unit?.id} (ord ${gated.unit?.ord})`);

section("a broken chain can never end someone's course");
/* Restore unit 3 so the chain is linear again, leaving unit 2 gated. Now every
   unit after it is transitively blocked. The first attempt at this fell
   through to "the course is finished" and handed a beginner b1-2-u20 — the
   last unit of B1.2. Bad content data must not be able to do that. */
const db5 = open();
db5.prepare("UPDATE unit SET prereq_json = ? WHERE id = ?").run(third.prereq_json, third.id);
db5.close();

const deadlocked = await get(`/api/session?user=${U}`);
ok(deadlocked.unit?.id === second.id,
  "with everything blocked, prerequisites are ignored rather than the learner stranded",
  deadlocked.unit?.id);
ok(!deadlocked.unit?.id?.startsWith("b1-2"),
  "and nobody is flung to the end of the course", deadlocked.unit?.id);

const original = second.prereq_json;

section("bad prerequisite data is ignored, not obeyed");
/* A typo in the content files must not gate a unit on something that cannot
   ever be completed. An id that is not a unit is skipped, not treated as
   unmet — otherwise a one-character mistake silently changes the curriculum. */
const db6 = open();
db6
  .prepare("UPDATE unit SET prereq_json = ? WHERE id = ?")
  .run(JSON.stringify(["a-unit-that-does-not-exist"]), second.id);
db6.close();

const typo = await get(`/api/session?user=${U}`);
ok(typo.unit?.id === second.id, "an unknown prerequisite is ignored", typo.unit?.id);

const db7 = open();
db7.prepare("UPDATE unit SET prereq_json = ? WHERE id = ?").run("not json at all", second.id);
db7.close();
const broken = await get(`/api/session?user=${U}`);
ok(broken.unit?.id === second.id, "so is a malformed blob", broken.unit?.id);

/* Put the content back exactly as it was. This is the shared seeded database —
   these tests use a throwaway USER, not a throwaway curriculum, so a unit left
   rewired here would follow the real learner into their next session. */
const db8 = open();
db8.prepare("UPDATE unit SET prereq_json = ? WHERE id = ?").run(original, second.id);
db8.close();
const db9 = open();
const restored = (
  db9.prepare("SELECT prereq_json FROM unit WHERE id = ?").get(second.id) as {
    prereq_json: string;
  }
).prereq_json;
const thirdBack = (
  db9.prepare("SELECT prereq_json FROM unit WHERE id = ?").get(third.id) as {
    prereq_json: string;
  }
).prereq_json;
db9.close();
ok(restored === original, "unit 2's prerequisite is back", restored);
ok(thirdBack === third.prereq_json, "and unit 3's", thirdBack);

done();
