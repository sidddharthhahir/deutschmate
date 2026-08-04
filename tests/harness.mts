/**
 * The whole test harness. No framework, on purpose.
 *
 * These tests exist to answer one question before a change ships: does a
 * learner still get through the course. That needs a real database and a real
 * server, not mocks — so the harness is a few helpers over fetch and
 * node:sqlite rather than a runner with its own opinions about them.
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DB_PATH } from "../src/lib/db.ts";
import { TEST_HEADER, TEST_ENV, MIN_TOKEN } from "../src/lib/trust.ts";
import { SESSION_COOKIE, UID_COOKIE, createSession } from "../src/lib/auth.ts";
import { createUser } from "../src/lib/accounts.ts";

export const BASE = process.env.DM_TEST_URL ?? "http://127.0.0.1:3000";
const HERE = path.dirname(fileURLToPath(import.meta.url));

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
  "word_seen", "pending_correction", "card",
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
/**
 * The shared secret that lets a request name a learner other than the cookie's.
 *
 * `?user=` used to be honoured for anyone who typed it. It is gated now (see
 * lib/trust.ts), and these tests are the reason the door exists at all:
 * isolation by user id is exactly how the app separates two people, so driving
 * a throwaway learner exercises the real mechanism instead of a mock of it.
 *
 * Read from .env.local — the same file Next loads for the dev server — so both
 * halves see one value with nothing to keep in sync by hand.
 */
const AUTH = (() => {
  try {
    process.loadEnvFile(path.join(HERE, "..", ".env.local"));
  } catch {
    /* no .env.local, or already loaded — fall through to the ambient env */
  }
  return (process.env[TEST_ENV] ?? "").trim();
})();

/**
 * Fail loudly rather than quietly writing to the wrong account.
 *
 * Without the header the server ignores the name and falls back to the default
 * learner, so an unconfigured harness would not error — it would run every test
 * against the developer's own deck and mostly pass. That is the worst failure
 * mode a test suite can have, so it is made impossible here.
 */
function auth(named: boolean): Record<string, string> {
  if (named && AUTH.length < MIN_TOKEN) {
    throw new Error(
      `this test drives a throwaway learner, which needs ${TEST_ENV} in .env.local — ` +
        "run `npm run setup` to generate one, then restart `npm run dev` so the " +
        "server picks it up too",
    );
  }
  return AUTH ? { [TEST_HEADER]: AUTH } : {};
}

export async function get(p: string): Promise<any> {
  const res = await fetch(BASE + p, { headers: auth(p.includes("user=")) });
  return res.json();
}

export async function post(p: string, body: unknown): Promise<any> {
  // The name can arrive in the body as well as the query.
  const named = p.includes("user=") || (!!body && typeof body === "object" && "user" in body);
  const res = await fetch(BASE + p, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(named) },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * A real signed-in session for a throwaway learner, as a Cookie header.
 *
 * Page tests used to send `dm_user=<name>`, which was the identity — a name in
 * a readable cookie. It is not any more, so they get a genuine session row
 * instead, minted the same way the sign-in link mints one. The tests exercise
 * the real mechanism rather than a way around it, which is the same reason the
 * `?user=` door exists for the API tests.
 */
export function signedIn(name: string): string {
  const user = createUser(name);
  const { value } = createSession(user.id);
  return `${SESSION_COOKIE}=${value}; ${UID_COOKIE}=${user.id}`;
}

/** Fetch a PAGE as a signed-in learner. */
export async function pageRes(p: string, name: string): Promise<Response> {
  return fetch(BASE + p, { headers: { Cookie: signedIn(name) } });
}

/**
 * A raw request, for the tests that care about the status code or that need to
 * send NO credential — which is the only way to check the door is shut.
 */
export async function raw(
  p: string,
  init: RequestInit & { authenticate?: boolean } = {},
): Promise<Response> {
  const { authenticate = false, ...rest } = init;
  return fetch(BASE + p, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(authenticate && AUTH ? { [TEST_HEADER]: AUTH } : {}),
      ...(rest.headers as Record<string, string> | undefined),
    },
  });
}
