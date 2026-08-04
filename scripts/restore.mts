/**
 * Restore the progress half from a JSON export.
 *
 *   node scripts/restore.mts backups/2026-08-03T12-00-00.json
 *   node scripts/restore.mts backups/....json --dry
 *
 * Content (words, units, grammar, readings) is NOT touched — that comes from
 * the repo via `npm run seed`. This puts back the part that only exists on
 * your machine: cards, attempts, streaks, mined gaps, exam runs.
 *
 * Refuses to run against a database that already has progress unless you pass
 * --force. Silently merging two histories would produce a streak and a review
 * count that never happened, and a wrong number here is worse than an error.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { applySchema } from "../src/lib/db.ts";

const ROOT = process.cwd();
const DB_PATH = process.env.DEUTSCHMATE_DB
  ? path.resolve(process.env.DEUTSCHMATE_DB)
  : path.join(ROOT, "deutschmate.db");

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const dry = args.includes("--dry");
const force = args.includes("--force");

if (!file) {
  console.error("Usage: node scripts/restore.mts <export.json> [--dry] [--force]");
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`No such file: ${file}`);
  process.exit(1);
}

const payload = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
if (payload.schema !== 1) {
  console.error(`Unknown export schema: ${String(payload.schema)}`);
  process.exit(1);
}

/* Order matters: user first (everything references it), then the rest. */
const TABLES = [
  "user",
  "card",
  "attempt",
  "unit_progress",
  "word_seen",
  "session_log",
  "cloze",
  "exam_run",
  "pending_correction",
];

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA busy_timeout = 10000");
applySchema(db, readFileSync(path.join(ROOT, "src/lib/schema.sql"), "utf8"));

const existing = db.prepare("SELECT COUNT(*) AS n FROM attempt").get() as { n: number };
if (existing.n > 0 && !force && !dry) {
  console.error(
    `This database already has ${existing.n} attempts.\n` +
      `Restoring would mix two histories and produce counts that never happened.\n` +
      `Back it up first, then re-run with --force to replace the progress tables.`,
  );
  process.exit(1);
}

console.log(`${dry ? "Would restore" : "Restoring"} from ${path.basename(file)}`);
console.log(`  exported ${String(payload.exportedAt ?? "unknown")}\n`);

let total = 0;
if (!dry) db.exec("BEGIN");
try {
  // Wipe in reverse dependency order so foreign keys never dangle mid-restore.
  if (!dry) for (const t of [...TABLES].reverse()) db.exec(`DELETE FROM ${t}`);

  for (const t of TABLES) {
    const rows = payload[t];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const cols = Object.keys(rows[0] as object);
    console.log(`  ${t.padEnd(20)} ${String(rows.length).padStart(6)} rows`);
    total += rows.length;
    if (dry) continue;

    const stmt = db.prepare(
      `INSERT OR REPLACE INTO ${t} (${cols.join(",")})
       VALUES (${cols.map(() => "?").join(",")})`,
    );
    for (const r of rows as Record<string, unknown>[]) {
      stmt.run(...(cols.map((c) => r[c] ?? null) as never[]));
    }
  }
  if (!dry) db.exec("COMMIT");
} catch (e) {
  if (!dry) db.exec("ROLLBACK");
  throw e;
}

db.close();
console.log(`\n${dry ? "Dry run — nothing written." : `Restored ${total} rows.`}`);
