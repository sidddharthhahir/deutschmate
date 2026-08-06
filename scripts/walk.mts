/**
 * Fetch every page as a signed-in learner and report what comes back.
 *
 *   node scripts/walk.mts            # against http://127.0.0.1:3000
 *   node scripts/walk.mts http://…   # somewhere else
 *
 * A route that 500s, or renders Next's error boundary, is a page nobody can
 * use — and the only way to find that is to ask for all of them. Dynamic
 * segments are filled from real rows, so the ids are ones that exist.
 */
import { SESSION_COOKIE, UID_COOKIE, createSession } from "../src/lib/auth.ts";
import { createUser } from "../src/lib/accounts.ts";
import { get } from "../src/lib/db.ts";
import { survivalScenarios } from "../src/lib/survival.ts";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const user = createUser("walk-probe");
const { value } = createSession(user.id);
const Cookie = `${SESSION_COOKIE}=${value}; ${UID_COOKIE}=${user.id}`;

const first = (sql: string) => get<{ id: string }>(sql)?.id;
const tag =
  get<{ t: string }>(
    "SELECT tag AS t FROM error_pattern WHERE tag IS NOT NULL LIMIT 1",
  )?.t ?? "verb-ending";

const routes = [
  "/",
  "/wortschatz",
  "/ueben",
  "/fortschritt",
  "/weg",
  "/woche",
  "/wer",
  "/willkommen",
  "/einstellungen",
  "/alltag",
  "/aussprache",
  "/nachrichten",
  "/problemwoerter",
  "/pruefung",
  "/text",
  "/unterwegs",
  "/session",
  "/session?kurz=1",
  "/anmelden",
  "/admin/video",
  `/wort/${first("SELECT id FROM word LIMIT 1")}`,
  `/grammatik/${get<{ id: string }>("SELECT slug AS id FROM grammar LIMIT 1")?.id}`,
  `/alltag/${survivalScenarios()[0]?.id ?? "x"}`,
  `/szenario/${first("SELECT id FROM unit WHERE scenario_json IS NOT NULL LIMIT 1")}`,
  `/fehler/${tag}`,
];

/* Next renders a client error boundary with a 200, so the status alone is not
   enough — a page can be "fine" and be an apology screen.
   Truncated before the apostrophe on purpose: Next escapes it to &#x27; in the
   HTML, and strings.test.mts forbids an HTML entity in a string literal
   anywhere in src, data or scripts. This prefix is unambiguous either way. */
const BROKEN = [
  "This page couldn",
  "Application error",
  "Internal Server Error",
  "__next_error__",
];

let bad = 0;
console.log(`\n  ${routes.length} routes against ${BASE}\n`);
for (const r of routes) {
  try {
    const res = await fetch(BASE + r, {
      headers: { Cookie },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text();
    const hit = BROKEN.find((m) => body.includes(m));
    const ok = res.ok && !hit;
    if (!ok) bad++;
    console.log(
      `  ${ok ? "ok " : "BAD"} ${String(res.status).padEnd(4)} ${String(body.length).padStart(7)}b  ${r}${hit ? `   << ${hit}` : ""}`,
    );
  } catch (e) {
    bad++;
    console.log(`  BAD  ---        0b  ${r}   << ${(e as Error).message}`);
  }
}
console.log(`\n  ${routes.length - bad} fine, ${bad} broken\n`);
if (bad) process.exit(1);
