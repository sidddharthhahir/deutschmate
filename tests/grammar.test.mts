/**
 * Grammar rules are scheduled, not just displayed once.
 *
 * A rule taught in unit 3 and never seen again is a rule you do not have. This
 * checks the card exists, does not come straight back the same day, returns
 * when it falls due, and shows a different drill the second time.
 *
 * needs: server, seeded database
 */
import { get, post, ok, section, done, scratchUser, open } from "./harness.mts";

const U = scratchUser("test-grammar");
await get(`/api/session?user=${U}`); // create the user

const db0 = open();
const gid = (db0.prepare("SELECT id FROM grammar ORDER BY ord LIMIT 1").get() as { id: string }).id;
db0.close();

function card() {
  const db = open();
  const r = db
    .prepare("SELECT id, reps, due, state FROM card WHERE user_id = ? AND ref_type = 'grammar' AND ref_id = ?")
    .get(U, gid) as { id: number; reps: number; due: string; state: number } | undefined;
  db.close();
  return r;
}

function setDue(id: number, sql: string) {
  const db = open();
  db.prepare(`UPDATE card SET ${sql} WHERE id = ?`).run(id);
  db.close();
}

section("introduction");
// A lesson posts one attempt per drill; they must collapse into one rep.
for (let k = 0; k < 3; k++) {
  await post("/api/attempt", { user: U, kind: "new-grammar", refId: gid, correct: true });
}
const c = card();
ok(!!c, "a card was created", gid);
ok(c!.reps === 1, "exactly one rep from three drills", `reps=${c!.reps}`);
ok(c!.state > 0, "it left the 'new' state", `state=${c!.state}`);
ok(new Date(c!.due.replace(" ", "T") + "Z") > new Date(), "and is not due again immediately", c!.due);

const s = await get(`/api/session?user=${U}`);
ok(!s.blocks.some((b: any) => b.kind === "grammar-review"),
  "no grammar review in the very session it was taught",
  s.blocks.map((b: any) => b.kind).join(" "));

section("when it comes due");
setDue(c!.id, "due = datetime('now','-1 day')");
const s2 = await get(`/api/session?user=${U}`);
const gr = s2.blocks.find((b: any) => b.kind === "grammar-review");
ok(!!gr, "the grammar review appears", s2.blocks.map((b: any) => b.kind).join(" "));

const gc = gr.payload.cards[0];
ok(gc.drills.length > 0, "it carries drills", `${gc.drills.length} drills · ${gc.title}`);
ok(typeof gc.cardId === "number", "and a gradeable cardId");

section("grading it");
const beforeReps = card()!.reps;
await post("/api/review", { user: U, cardId: gc.cardId, grade: 3 });
ok(card()!.reps === beforeReps + 1, "grading advances the card", `${beforeReps} -> ${card()!.reps}`);
ok(!(await get(`/api/session?user=${U}`)).blocks.some((b: any) => b.kind === "grammar-review"),
  "and it leaves the queue");

const db2 = open();
const logged = (
  db2.prepare("SELECT COUNT(*) n FROM attempt WHERE user_id = ? AND kind = 'review'").get(U) as { n: number }
).n;
db2.close();
ok(logged >= 1, "the grade was logged as an attempt", logged);

section("drill rotation");
setDue(c!.id, "due = datetime('now','-1 day'), reps = 0");
const first = (await get(`/api/session?user=${U}`)).blocks
  .find((b: any) => b.kind === "grammar-review")?.payload.cards[0].drills[0].q;
setDue(c!.id, "due = datetime('now','-1 day'), reps = 1");
const second = (await get(`/api/session?user=${U}`)).blocks
  .find((b: any) => b.kind === "grammar-review")?.payload.cards[0].drills[0].q;
ok(first !== second, "a different drill on the next visit",
  `"${String(first).slice(0, 30)}…" vs "${String(second).slice(0, 30)}…"`);

done();
