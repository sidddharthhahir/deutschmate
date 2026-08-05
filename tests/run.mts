/** npm test Runs every tests/*.test.mts in its own process and reports one line each. */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.DM_TEST_URL ?? "http://127.0.0.1:3000";
const filters = process.argv.slice(2);

const files = readdirSync(HERE)
  .filter((f) => f.endsWith(".test.mts"))
  .filter((f) => !filters.length || filters.some((q) => f.includes(q)))
  .sort();

if (!files.length) {
  console.error(
    filters.length
      ? `No test matches ${filters.join(", ")}`
      : "No tests found.",
  );
  process.exit(1);
}

/** The `needs:` line in each file's header says what it depends on. */
function needs(file: string): string {
  const head = readFileSync(path.join(HERE, file), "utf8").slice(0, 2000);
  return /^\s*\*\s*needs:\s*(.+)$/m.exec(head)?.[1]?.trim() ?? "";
}

const wantsServer = files.some((f) => needs(f).includes("server"));
let serverUp = false;
if (wantsServer) {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(4000) });
    serverUp = res.ok;
  } catch {
    serverUp = false;
  }
}

const results: {
  file: string;
  state: "pass" | "fail" | "skip";
  note: string;
}[] = [];

for (const file of files) {
  const need = needs(file);
  if (need.includes("server") && !serverUp) {
    results.push({ file, state: "skip", note: `needs a server at ${BASE}` });
    console.log(
      `\n${"=".repeat(64)}\n  ${file}   SKIPPED — no server at ${BASE}\n${"=".repeat(64)}`,
    );
    continue;
  }

  console.log(`\n${"=".repeat(64)}\n  ${file}\n${"=".repeat(64)}`);
  const run = spawnSync(process.execPath, [path.join(HERE, file)], {
    stdio: "inherit",
    env: process.env,
  });
  const passed = run.status === 0;
  results.push({
    file,
    state: passed ? "pass" : "fail",
    note: passed ? "" : run.status === null ? "crashed" : `exit ${run.status}`,
  });
}

console.log(`\n${"=".repeat(64)}`);
for (const r of results) {
  const label = { pass: "PASS", fail: "FAIL", skip: "SKIP" }[r.state];
  console.log(`  ${label}  ${r.file.padEnd(30)} ${r.note}`);
}

const failed = results.filter((r) => r.state === "fail").length;
const skipped = results.filter((r) => r.state === "skip").length;
console.log(
  `\n${results.length - failed - skipped} passed` +
    (failed ? `, ${failed} FAILED` : "") +
    (skipped
      ? `, ${skipped} skipped — start \`npm run dev\` to run those`
      : ""),
);
process.exit(failed ? 1 : 0);
