/**
 * The whole test harness. No framework, on purpose.
 *
 * These tests exist to answer one question before a change ships: does a
 * learner still get through the course. That needs a real database and a real
 * server, not mocks — so the harness is a few helpers over fetch and
 * node:sqlite rather than a runner with its own opinions about them.
 */
import { DatabaseSync } from "node:sqlite";
import { DB_PATH } from "../src/lib/db.ts";

export const BASE = process.env.DM_TEST_URL ?? "http://127.0.0.1:3000";

let failures = 0;
let checks = 0;

/** Assert, and say what actually happened when it fails. */
export function ok(cond: unknown, msg: string, detail: string | number = "") {
  checks++;
  if (!cond) failures++;
  const d = detail === "" ? "" : `  ${detail}`;
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}${d}`);
}

/** Assert deep equality, printing both sides when they differ. */
export function eq(got: unknown, want: unknown, msg: string) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  checks++;
  const pass = g === w;
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${msg}${pass ? "" : `\n        got  ${g}\n        want ${w}`}`);
}

export function section(title: string) {
  console.log(`\n--- ${title} ---`);
}

/** Exit with the right code and a one-line verdict. Every test file ends here. */
export function done(): never {
  console.log(`\n${failures === 0 ? `ALL PASS  (${checks} checks)` : `${failures} FAILURES of ${checks}`}`);
  process.exit(failures ? 1 : 0);
}

// ------------------------------------------------------------------ database
export function open() {
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA busy_timeout = 10000");
  return db;
}

/** Every table keyed by user. A test user must leave nothing behind. */
const USER_TABLES = [
  "attempt", "cloze", "exam_run", "session_log", "unit_progress",
  "browse_progress", "pending_correction", "card",
];

/**
 * Wipe a throwaway user, and register the wipe to run again on exit.
 *
 * Tests share the developer's own database — building a second one would mean
 * a second copy of the seed, and then the tests would stop covering the data
 * that actually ships. Isolation comes from the user id instead, which is how
 * the app itself separates two flatmates.
 */
export function scratchUser(name: string): string {
  const wipe = () => {
    const db = open();
    for (const t of USER_TABLES) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(name);
    db.prepare("DELETE FROM user WHERE id = ?").run(name);
    db.close();
  };
  wipe();
  process.on("exit", wipe);
  return name;
}

/**
 * Move a user's attempts back a day.
 *
 * New vocabulary is introduced once per calendar day, so a test that wants a
 * second day has to age the attempts. `session_log` deliberately stays on
 * today: ageing that too makes the app think the learner has been away, and it
 * correctly switches to Wiedereinstieg, which has no vocabulary block.
 */
export function nextDay(user: string) {
  const db = open();
  db.prepare("UPDATE attempt SET created_at = datetime(created_at,'-1 day') WHERE user_id = ?").run(user);
  db.close();
}

// ---------------------------------------------------------------------- http
export async function get(path: string): Promise<any> {
  const res = await fetch(BASE + path);
  return res.json();
}

export async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
