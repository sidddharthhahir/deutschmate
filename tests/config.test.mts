/**
 * Does config.ts actually control anything?
 *
 * The file exists because the numbers that decide how the course behaves were
 * scattered across twelve files, and "what does this app decide for you" was
 * unanswerable without reading all of them. Moving them into one place only
 * helps if the call sites were rewired too — and five of them were not. GAP_DAYS,
 * GAP_BACKLOG, GAP_CARDS, PACE_CUT_ACCURACY and CLOZE_PER_SESSION sat in
 * config.ts documenting decisions that were still hardcoded elsewhere, so
 * editing config changed nothing and the file quietly lied.
 *
 * That failure is invisible: nothing errors, the app behaves exactly as before,
 * and the constant looks authoritative. So this suite asserts the connection
 * itself — every exported constant has to be imported by something.
 *
 * needs: nothing
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ok, eq, section, done } from "./harness.mts";
import * as config from "../src/lib/config.ts";
import { PACE_CUT_ACCURACY, PACE_MIN_REVIEWS } from "../src/lib/config.ts";

function walk(dir: string, out: string[] = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(e)) out.push(p.replace(/\\/g, "/"));
  }
  return out;
}

const sources = walk("src")
  .filter((f) => !f.endsWith("src/lib/config.ts"))
  .map((f) => ({ f, text: readFileSync(f, "utf8") }));

section("every constant in config.ts is read by something");
const names = Object.keys(config).filter((k) => k === k.toUpperCase());
ok(names.length > 8, "there are constants to check", `${names.length}`);

for (const name of names) {
  const users = sources.filter(({ text }) => new RegExp(`\\b${name}\\b`).test(text));
  ok(
    users.length > 0,
    `${name} is imported somewhere`,
    users.length ? users[0].f.replace("src/", "") : "NOTHING READS IT — the value is decorative",
  );
}

section("the two that need a unit conversion still have one");
/*
 * PACE_CUT_ACCURACY is a fraction; the code compares it against a percentage.
 * The obvious "cleanup" — dropping the ×100 — compares 74 to 0.8 and throttles
 * every learner permanently, with no error and no visible cause. Pin it.
 */
ok(PACE_CUT_ACCURACY > 0 && PACE_CUT_ACCURACY <= 1, "PACE_CUT_ACCURACY is a fraction", `${PACE_CUT_ACCURACY}`);
const budget = readFileSync("src/lib/session.ts", "utf8");
ok(
  /PACE_CUT_ACCURACY\s*\*\s*100/.test(budget),
  "and session.ts multiplies it before comparing to a percentage",
);
ok(
  Number.isInteger(PACE_MIN_REVIEWS) && PACE_MIN_REVIEWS > 0,
  "PACE_MIN_REVIEWS is a whole number of reviews",
  `${PACE_MIN_REVIEWS}`,
);

section("the gap rule reads its thresholds rather than repeating them");
/* Literals here are how the drift happened the first time. */
ok(
  !/gap\s*>=\s*\d/.test(budget),
  "no bare number in the gap-days comparison",
);
ok(
  !/total\s*>\s*\d{2}/.test(budget),
  "no bare number in the backlog comparison",
);
eq(
  /dueCards\(userId,\s*\d+\)/.test(budget),
  false,
  "and the recovery session's card count is not a literal either",
);

done();
