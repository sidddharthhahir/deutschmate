/**
 * One command to make a fresh clone runnable.
 *
 *   npm run setup
 *
 * Everything the app needs is either in the repo or built from it. This checks
 * the machine can run it, builds the database from data/, and tells you the
 * one thing it cannot do for you (the API key).
 *
 * Deliberately idempotent: running it on an existing install re-seeds the
 * content half and leaves your progress alone, because content and progress
 * live in separate tables for exactly this reason (spec §10).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
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
  console.log("\n    node:sqlite is built into Node 24. Without it there is no");
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

// ------------------------------------------------------------------ seed
console.log("\n  Building the database from data/ …\n");
const seed = spawnSync(process.execPath, [path.join(ROOT, "scripts/seed.mts")], {
  stdio: "inherit",
  cwd: ROOT,
});
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
  warn("no recordings — run `npm run audio` (the browser will speak until then)");
}

// -------------------------------------------------------------------- db
const { DB_PATH } = await import("../src/lib/db.ts");
if (existsSync(DB_PATH)) {
  ok(`${path.basename(DB_PATH)}  ${(statSync(DB_PATH).size / 1048576).toFixed(1)} MB`);
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
