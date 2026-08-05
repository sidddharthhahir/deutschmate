/**
 * Deployment configuration: everything that differs between one machine and
 * another, and nothing that differs between one learner and another.
 *
 * WHY THIS EXISTS
 *
 * `process.env.X` was read in five places with a different fallback each time,
 * and every one of them failed silently. `DEUTSCHMATE_BUDGT=5` is not an error;
 * it is a budget of $5 because the typo'd name was never read. Nothing tells
 * you. The same is true of the two variables added with sign-in, and one of
 * those is worse than silent: get DEUTSCHMATE_URL wrong and every sign-in link
 * points at a host nobody can reach, which looks like the mail not arriving.
 *
 * So: one module, every variable named once, each with a default that is
 * stated rather than implied, and `describe()` so an operator can ask the
 * server what it thinks it is doing.
 *
 * Deliberately NOT a schema library. Nine variables do not need a dependency,
 * and a hand-written check can say something useful about each one.
 */

import { secretsAvailable } from "./secrets.ts";
import { anyStoredKeys } from "./apikey.ts";
import { orphanedRows } from "./shared-cache.ts";
import { get } from "./db.ts";
import {
  from as mailFrom,
  fromWillBeRewritten,
  mailReady,
  transport as mailTransport,
} from "./mail.ts";

export type Issue = { name: string; level: "error" | "warn"; message: string };

const str = (name: string): string => (process.env[name] ?? "").trim();

/** Where sign-in links point. Wrong here means links nobody can follow. */
export function baseUrl(): string {
  return str("DEUTSCHMATE_URL").replace(/\/$/, "") || "http://localhost:3000";
}

/*
 * THE THREE BELOW ARE RE-EXPORTS, NOT COPIES.
 *
 * This file exists because `process.env.X` was read in five places with a
 * different fallback each time. Adding it created three second copies of rules
 * that already lived elsewhere — the same failure, one layer up, and the worst
 * kind because both copies look canonical:
 *
 *   budgetCeiling  pricing.ceiling() already owned it, and its own docstring
 *                  says the guard that enforces the budget must not be able to
 *                  disagree with the bar the progress page draws. cost.ts read
 *                  one, Einstellungen read the other.
 *   adminEnabled   trust.ts already owned it, and /api/video uses that one.
 *   serverApiKey   apikey.ts already inlined the same two-variable fallback.
 *
 * One implementation each, named here so `describe()` and `check()` can report
 * on them without a fourth.
 */
/* Imported as well as re-exported: `export … from` forwards the name without
   binding it locally, and check()/describe() below call all three. */
import { ceiling as budgetCeiling } from "./pricing.ts";
import { adminEnabled } from "./trust.ts";
import { serverApiKey } from "./apikey.ts";
export { budgetCeiling, adminEnabled, serverApiKey };

/**
 * Everything wrong or worth knowing about the current environment.
 *
 * Reported, never thrown: a misconfigured budget must not stop somebody
 * revising. The one thing that would be worth refusing to start over does not
 * exist yet — encrypted per-learner keys with no master key to read them —
 * and that check belongs with the feature (step 4), not ahead of it.
 */
export function check(): Issue[] {
  const issues: Issue[] = [];

  const url = str("DEUTSCHMATE_URL");
  if (!url) {
    issues.push({
      name: "DEUTSCHMATE_URL",
      level: "warn",
      message: "unset — sign-in links will point at http://localhost:3000",
    });
  } else if (!/^https?:\/\//.test(url)) {
    issues.push({
      name: "DEUTSCHMATE_URL",
      level: "error",
      message: `"${url}" has no scheme — links built from it will not work`,
    });
  } else if (url.startsWith("http://") && !/localhost|127\.0\.0\.1|\.local/.test(url)) {
    issues.push({
      name: "DEUTSCHMATE_URL",
      level: "warn",
      message: "plain http on a non-local host — the session cookie will not be marked secure",
    });
  }

  const budget = str("DEUTSCHMATE_BUDGET");
  if (budget && !(Number.isFinite(Number(budget)) && Number(budget) >= 0)) {
    issues.push({
      name: "DEUTSCHMATE_BUDGET",
      level: "error",
      message: `"${budget}" is not a number — falling back to $5 per learner`,
    });
  }

  const testAuth = str("DEUTSCHMATE_TEST_AUTH");
  if (testAuth && testAuth.length < 24) {
    issues.push({
      name: "DEUTSCHMATE_TEST_AUTH",
      level: "error",
      message: "shorter than 24 characters, so it is ignored and the tests cannot run",
    });
  }
  if (testAuth && url.startsWith("https://")) {
    issues.push({
      name: "DEUTSCHMATE_TEST_AUTH",
      level: "warn",
      message: "set on what looks like a real deployment — it allows acting as any learner",
    });
  }

  /*
   * Mail configured but unusable is worse than mail not configured, because
   * the console fallback is gone and the only symptom is silence.
   */
  const mail = mailReady();
  if (!mail.ok) {
    issues.push({ name: "DEUTSCHMATE_MAIL", level: "error", message: mail.why! });
  }

  /* Separate checks, not an else-if chain: a Gmail From mismatch and links
     pointing at localhost are unrelated, and reporting only the first would
     send somebody to fix one and hit the other. */
  const rewritten = fromWillBeRewritten();
  if (rewritten) {
    issues.push({ name: "DEUTSCHMATE_MAIL_FROM", level: "warn", message: rewritten });
  }

  if (mailTransport() !== "console" && url.startsWith("http://localhost")) {
    issues.push({
      name: "DEUTSCHMATE_MAIL",
      level: "error",
      message:
        "sending real email with links that point at localhost — every recipient gets a dead link",
    });
  }

  if (adminEnabled()) {
    issues.push({
      name: "DEUTSCHMATE_ADMIN",
      level: "warn",
      message: "on — /api/video can write to the shared curriculum",
    });
  }

  /*
   * The one check that needs the database, and the one worth making loud.
   *
   * Learners' API keys are encrypted with DEUTSCHMATE_SECRET. Lose it or change
   * it and every stored key becomes unreadable — nobody's progress is harmed,
   * but every AI feature silently reverts to its offline path and the only
   * symptom is "the conversation stopped working". Saying so here turns a
   * mystery into a sentence.
   *
   * Guarded, because this also runs from `npm run config` on a machine that may
   * have no database yet.
   */
  try {
    if (!secretsAvailable() && anyStoredKeys()) {
      issues.push({
        name: "DEUTSCHMATE_SECRET",
        level: "error",
        message:
          "missing or too short, and learners have stored keys — none of them can be read",
      });
    } else if (!secretsAvailable()) {
      issues.push({
        name: "DEUTSCHMATE_SECRET",
        level: "warn",
        message: "unset — this server will refuse to store anybody's API key",
      });
    }
  } catch {
    /* no database yet; nothing to be inconsistent with */
  }

  /*
   * localhost is fine until it is not, and the moment it stops being fine is
   * knowable: a second account exists.
   *
   * A sign-in link is built from DEUTSCHMATE_URL and mailed to a person. If it
   * says localhost, it resolves to THEIR machine, where nothing is listening —
   * and the failure looks exactly like the email not arriving, which is the
   * least debuggable symptom this app can produce. Nobody remembers to change a
   * URL at deploy time; they remember when the first invite bounces.
   *
   * One account and localhost is the ordinary single-person install, and says
   * nothing.
   */
  try {
    const local = !url || /localhost|127\.0\.0\.1/.test(url);
    const n = get<{ n: number }>("SELECT COUNT(*) AS n FROM user")?.n ?? 0;
    if (local && n > 1) {
      issues.push({
        name: "DEUTSCHMATE_URL",
        level: "error",
        message: `${n} accounts on this install, but links point at localhost — everyone but you gets a link to their own machine`,
      });
    }
  } catch {
    /* no database yet */
  }

  /*
   * Cached explanations with no owner and no share flag.
   *
   * The migration that added `explanation.created_by` keeps the rows whose
   * sentence is app content and deletes the rest, so this should be zero. It is
   * reported rather than cleaned up silently: these rows can contain German
   * somebody pasted, and what happens to a leftover of that kind is the
   * operator's call, not a side effect of starting the server.
   */
  try {
    const n = orphanedRows();
    if (n > 0) {
      issues.push({
        name: "explanation",
        level: "warn",
        message: `${n} cached explanation(s) have no owner — nobody can read them; remove with: DELETE FROM explanation WHERE shared = 0 AND created_by IS NULL`,
      });
    }
  } catch {
    /* no database yet */
  }

  return issues;
}

/** One line per setting, for `npm run config` and the startup banner. */
export function describe(): { name: string; value: string; note: string }[] {
  const key = serverApiKey();
  return [
    {
      name: "DEUTSCHMATE_URL",
      value: baseUrl(),
      note: "where sign-in links point",
    },
    {
      name: "DEUTSCHMATE_BUDGET",
      value: `$${budgetCeiling().toFixed(2)}`,
      note: "per learner per rolling 30 days, enforced",
    },
    {
      name: "DEUTSCHMATE_ADMIN",
      value: adminEnabled() ? "on" : "off",
      note: "writes to shared content",
    },
    {
      name: "DEUTSCHMATE_TEST_AUTH",
      value: str("DEUTSCHMATE_TEST_AUTH") ? "set" : "unset",
      note: "lets a request act as any learner; needed by the test suite",
    },
    {
      name: "ANTHROPIC_API_KEY",
      /* Never the value. This prints in a terminal that may be shared, and the
         only question worth answering is whether one is present. */
      value: key ? `set (…${key.slice(-4)})` : "unset",
      note: "the app's own key; learners bring their own from step 4",
    },
    {
      name: "DEUTSCHMATE_SECRET",
      /* Presence only. This is the key that decrypts every learner's API key;
         printing it in a terminal would be the worst line in the codebase. */
      value: secretsAvailable() ? "set" : "unset",
      note: "encrypts each learner's stored API key",
    },
    {
      name: "DEUTSCHMATE_MAIL",
      value:
        mailTransport() === "console"
          ? "console (links print to this terminal)"
          : `${mailTransport()} · from ${mailFrom()}`,
      note: "how sign-in links reach people",
    },
    {
      name: "DEUTSCHMATE_DB",
      value: str("DEUTSCHMATE_DB") || "deutschmate.db",
      note: "database file",
    },
  ];
}
