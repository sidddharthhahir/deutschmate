/**
 * One command to make a fresh clone runnable. npm run setup Everything the app needs is either in
 * the repo or built from it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

const ROOT = process.cwd();
const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const warn = (s: string) => console.log(`  \x1b[33m!\x1b[0m ${s}`);
const fail = (s: string) => console.log(`  \x1b[31m✕\x1b[0m ${s}`);

console.log("\nDeutschMate — setup\n");

// ------------------------------------------------------------------ node
const [major] = process.versions.node.split(".").map(Number);
if (major < 24) {
  fail(`Node ${process.versions.node} — this needs Node 24 or newer.`);
  console.log(
    "\n    node:sqlite is built into Node 24. Without it there is no",
  );
  console.log("    database at all, and no native module to install instead.");
  console.log("    https://nodejs.org — take the LTS.\n");
  process.exit(1);
}
ok(`Node ${process.versions.node}`);

// node:sqlite is the one runtime dependency that isn't an npm package.
try {
  await import("node:sqlite");
  ok("node:sqlite available");
} catch {
  fail("node:sqlite missing — is this really Node 24+?");
  process.exit(1);
}

// ------------------------------------------------------------------- env
const envPath = path.join(ROOT, ".env.local");
if (!existsSync(envPath)) {
  const example = path.join(ROOT, ".env.example");
  if (existsSync(example)) {
    writeFileSync(envPath, readFileSync(example, "utf8"), "utf8");
    warn(".env.local created from .env.example — add your API key");
  } else {
    writeFileSync(envPath, "ANTHROPIC_API_KEY=\n", "utf8");
    warn(".env.local created — add your API key");
  }
} else {
  const body = readFileSync(envPath, "utf8");
  const key = body.match(/^ANTHROPIC_API_KEY=(.*)$/m)?.[1]?.trim();
  if (key && key.length > 10) ok(".env.local has an API key");
  else warn(".env.local has no API key yet");
}

/*
 * The test suite's credential. Never regenerated: overwriting it would silently break a dev server
 * that is already running with the old value.
 */
/** Generate a secret into .env.local if it is missing or too weak. */
function ensureSecret(
  name: string,
  bytes: number,
  minLength: number,
  note: string,
) {
  const body = readFileSync(envPath, "utf8");
  const existing = body.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim();
  if (existing && existing.length >= minLength) {
    ok(`${name} present`);
    return;
  }
  const line = `${name}=${randomBytes(bytes).toString("hex")}\n`;
  const next = new RegExp(`^${name}=.*$`, "m").test(body)
    ? body.replace(new RegExp(`^${name}=.*$`, "m"), line.trimEnd())
    : `${body.endsWith("\n") || body === "" ? body : body + "\n"}${line}`;
  writeFileSync(envPath, next, "utf8");
  ok(`${name} generated — ${note}`);
}

/* The test suite's credential. Six suites drive throwaway learners through
   `?user=`, which is gated on this (src/lib/trust.ts). */
ensureSecret(
  "DEUTSCHMATE_TEST_AUTH",
  24,
  24,
  "restart `npm run dev` before `npm test`",
);

/* The key that encrypts each learner's Anthropic key. */
ensureSecret(
  "DEUTSCHMATE_SECRET",
  32,
  32,
  "keep it: it decrypts everyone's stored API key",
);

// ------------------------------------------------------------------ seed
console.log("\n  Building the database from data/ …\n");
const seed = spawnSync(
  process.execPath,
  [path.join(ROOT, "scripts/seed.mts")],
  {
    stdio: "inherit",
    cwd: ROOT,
  },
);
if (seed.status !== 0) {
  fail("Seeding failed — see above.");
  process.exit(1);
}

// ----------------------------------------------------------------- audio
const audioDir = path.join(ROOT, "public/audio/words");
if (existsSync(audioDir)) {
  const { readdirSync } = await import("node:fs");
  const n = readdirSync(audioDir).filter((f) => f.endsWith(".ogg")).length;
  if (n > 500) ok(`${n} pronunciation recordings`);
  else warn(`only ${n} recordings — run \`npm run audio\` to fetch the rest`);
} else {
  warn(
    "no recordings — run `npm run audio` (the browser will speak until then)",
  );
}

// -------------------------------------------------------------------- db
const { DB_PATH } = await import("../src/lib/db.ts");
if (existsSync(DB_PATH)) {
  ok(
    `${path.basename(DB_PATH)}  ${(statSync(DB_PATH).size / 1048576).toFixed(1)} MB`,
  );
}

// ------------------------------------------------------------------ done
const hasKey = existsSync(envPath)
  ? /^ANTHROPIC_API_KEY=.{10,}$/m.test(readFileSync(envPath, "utf8"))
  : false;

console.log("\n" + "─".repeat(58));
if (!hasKey) {
  console.log("\n  One thing left. Put your key in .env.local:\n");
  console.log("      ANTHROPIC_API_KEY=sk-ant-…\n");
  console.log("  Everything except conversation, writing correction and");
  console.log("  sentence explanations works without it.\n");
}
console.log("  Start it:      npm run dev");
console.log("  From a phone:  npm run dev:lan");
console.log("  Back it up:    npm run backup\n");
