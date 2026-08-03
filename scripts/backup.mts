/**
 * Back up the database.
 *
 *   node scripts/backup.mts              # snapshot + JSON export
 *   node scripts/backup.mts --list       # what's already saved
 *   node scripts/backup.mts --prune 20   # keep the newest 20 snapshots
 *
 * Six months of learning lives in one file on one laptop. This is the cheapest
 * possible insurance against that file going away, and it exists because the
 * alternative — noticing after the fact — has no fix at all.
 *
 * Two artefacts per run, on purpose:
 *
 *   .db   a byte-exact snapshot, taken through SQLite's own VACUUM INTO so it
 *         is consistent even while the dev server is mid-write. Restoring is
 *         a file copy.
 *   .json the progress half only, in a form that outlives the schema. If the
 *         tables change shape a year from now, the .db may not restore cleanly
 *         but the JSON is still readable — by import.mts, or by a human.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DB_PATH = process.env.DEUTSCHMATE_DB
  ? path.resolve(process.env.DEUTSCHMATE_DB)
  : path.join(ROOT, "deutschmate.db");
const OUT = path.join(ROOT, "backups");

/** Per-user rows worth keeping. Content is regenerable from the repo. */
const PROGRESS_TABLES = [
  "user",
  "card",
  "attempt",
  "unit_progress",
  "browse_progress",
  "session_log",
  "cloze",
  "exam_run",
  "pending_correction",
];

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);

if (!existsSync(DB_PATH)) {
  console.error(`No database at ${DB_PATH}. Run \`npm run seed\` first.`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- --list
if (has("--list")) {
  const files = readdirSync(OUT)
    .filter((f) => f.endsWith(".db"))
    .sort()
    .reverse();
  if (!files.length) console.log("No backups yet.");
  for (const f of files) {
    const s = statSync(path.join(OUT, f));
    console.log(`  ${f}  ${(s.size / 1024 / 1024).toFixed(1)} MB  ${s.mtime.toISOString()}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- --prune N
if (has("--prune")) {
  const keep = Number(args[args.indexOf("--prune") + 1]);
  if (!Number.isFinite(keep) || keep < 1) {
    console.error("--prune needs a count, e.g. --prune 20");
    process.exit(1);
  }
  const stamps = [
    ...new Set(readdirSync(OUT).map((f) => f.replace(/\.(db|json)$/, ""))),
  ]
    .sort()
    .reverse();
  let removed = 0;
  for (const stamp of stamps.slice(keep)) {
    for (const ext of [".db", ".json"]) {
      const p = path.join(OUT, stamp + ext);
      if (existsSync(p)) {
        unlinkSync(p);
        removed++;
      }
    }
  }
  console.log(`Pruned ${removed} file(s), kept the newest ${keep} snapshot(s).`);
  process.exit(0);
}

// ---------------------------------------------------------------- backup
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dbOut = path.join(OUT, `${stamp}.db`);
const jsonOut = path.join(OUT, `${stamp}.json`);

const db = new DatabaseSync(DB_PATH, { readOnly: true });
db.exec("PRAGMA busy_timeout = 10000");

/* VACUUM INTO writes a consistent snapshot without stopping the server — a
   plain file copy of a live WAL database can land mid-transaction. */
db.exec(`VACUUM INTO '${dbOut.replace(/\\/g, "/").replace(/'/g, "''")}'`);

const payload: Record<string, unknown> = {
  exportedAt: new Date().toISOString(),
  schema: 1,
  source: path.basename(DB_PATH),
};

let rows = 0;
for (const t of PROGRESS_TABLES) {
  const exists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(t);
  if (!exists) continue;
  const data = db.prepare(`SELECT * FROM ${t}`).all().map((r) => ({ ...(r as object) }));
  payload[t] = data;
  rows += data.length;
}
db.close();

writeFileSync(jsonOut, JSON.stringify(payload, null, 2), "utf8");

const mb = (statSync(dbOut).size / 1024 / 1024).toFixed(1);
console.log(`OK  ${path.relative(ROOT, dbOut)}   ${mb} MB`);
console.log(`OK  ${path.relative(ROOT, jsonOut)}   ${rows} progress rows`);
console.log(`\nRestore:  copy the .db over deutschmate.db`);
console.log(`Or:       node scripts/restore.mts backups/${stamp}.json`);
