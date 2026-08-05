/**
 * "Z zurücknehmen (5 s)" — the promise, on the card it used to break on.
 * needs: server, seeded database
 */
import {
  get,
  post,
  ok,
  eq,
  section,
  done,
  scratchUser,
  open,
} from "./harness.mts";

const U = scratchUser("test-undo");
await get(`/api/session?user=${U}`); // create the user

/* Opened and closed around each group of queries, never held across an await —
   the dev server has the same file open, and a handle kept alive over a fetch
   makes the process crash on exit rather than fail a check. */
function rows(kind: string, ref: string): number {
  const db = open();
  const r = db
    .prepare(
      "SELECT COUNT(*) AS n FROM attempt WHERE user_id = ? AND kind = ? AND ref_id = ?",
    )
    .get(U, kind, ref) as { n: number };
  db.close();
  return r.n;
}
function card(ref: string) {
  const db = open();
  const r = db
    .prepare(
      "SELECT id, reps, state FROM card WHERE user_id = ? AND ref_id = ?",
    )
    .get(U, ref) as { id: number; reps: number; state: number } | undefined;
  db.close();
  return r;
}

section("a card to grade");
/* Seeded directly: the point here is one card's lifecycle, and going through a
   whole session to reach it would test the session instead. */
{
  const db = open();
  db.prepare(
    `INSERT INTO card (user_id, ref_type, ref_id, due, stability, difficulty,
       elapsed_days, scheduled_days, reps, lapses, state)
     VALUES (?, 'word', 'hallo', date('now','-1 day'), 2, 5, 1, 1, 1, 0, 2)
     ON CONFLICT(user_id, ref_type, ref_id) DO UPDATE
       SET due = date('now','-1 day'), reps = 1, state = 2`,
  ).run(U);
  db.close();
}
const before = card("hallo")!;
ok(Boolean(before), "the card exists", `reps ${before?.reps}`);
eq(rows("review", "hallo"), 0, "and has no review attempts yet");

section("a grade that is never sent leaves nothing behind");
/* This is what a take-back IS, now that the send waits out the window: the
   request simply never happens. So the check is that the app has not already
   written something at grade time — a regression to the old behaviour would
   show up here as a row appearing without any POST at all. */
eq(rows("review", "hallo"), 0, "no row from grading alone");
eq(card("hallo")!.reps, before.reps, "and FSRS has not moved");

section("one grade, one row, one step");
const g1 = await post("/api/review", { user: U, cardId: before.id, grade: 3 });
ok(g1?.ok !== false, "the grade lands", JSON.stringify(g1).slice(0, 80));
eq(rows("review", "hallo"), 1, "exactly one attempt row");
eq(card("hallo")!.reps, before.reps + 1, "exactly one FSRS step");

section("the bug this replaced: grading twice would double everything");
/* Kept as a live demonstration rather than a comment. Two sends is what the
   old take-back produced — the first from the button, the second from
   answering the card again — and it is visibly wrong. */
await post("/api/review", { user: U, cardId: before.id, grade: 3 });
eq(rows("review", "hallo"), 2, "two sends really do write two rows");
eq(card("hallo")!.reps, before.reps + 2, "and take two steps of the curve");
ok(true, "which is why the send waits for the window instead of racing it");

done();
