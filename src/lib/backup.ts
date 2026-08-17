import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { DB_PATH } from "./db.ts";

/**
 * Automatic snapshots, taken at the recap.
 *
 * Seven months of learning lives in one file on one laptop, deliberately not in
 * the repo. `npm run backup` has always existed and START-HERE suggests running
 * it "about once a week" — which is to say it depends on remembering, and the
 * cost of forgetting is everything. The recap is the one moment the app already
 * knows a session finished and that there is something new worth keeping, so it
 * is the honest place to do this without being asked.
 *
 * Deliberately NOT the JSON export that scripts/backup.mts also writes: this
 * runs inside a request, and a .db snapshot is one statement while the export
 * walks nine tables. `npm run restore` still reads the manual JSON; a snapshot
 * is restored by copying it over deutschmate.db.
 */

const OUT = path.join(process.cwd(), "backups");

/** Roughly a fortnight of daily study, and a few hundred MB at most. */
const KEEP = 14;

/** `2026-08-11T09-30-12` — sorts chronologically as a plain string. */
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;

function snapshots(): string[] {
  return readdirSync(OUT)
    .filter((f) => f.endsWith(".db") && STAMP.test(f.slice(0, -3)))
    .sort()
    .reverse();
}

/**
 * Keep the newest KEEP snapshots. Only files this module could have written are
 * ever removed — the name has to match the stamp exactly, so nothing a person
 * put in backups/ by hand is at risk.
 */
function prune() {
  for (const f of snapshots().slice(KEEP)) {
    try {
      unlinkSync(path.join(OUT, f));
    } catch {
      /* a snapshot that will not delete is not worth failing a session over */
    }
  }
}

/**
 * One snapshot per calendar day. Returns the file written, or null when today
 * already has one, when there is nothing to back up, or when it failed.
 *
 * Never throws. A backup that breaks the recap would cost the learner the very
 * session it was meant to protect — §the one rule is that reaching the end
 * saves your work, and nothing here may get in the way of that.
 */
export function snapshotIfDue(): string | null {
  try {
    if (!existsSync(DB_PATH)) return null;
    mkdirSync(OUT, { recursive: true });

    const today = new Date().toISOString().slice(0, 10);
    if (snapshots().some((f) => f.startsWith(today))) return null;

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const out = path.join(OUT, `${stamp}.db`);

    /*
     * VACUUM INTO on a separate read-only handle. A plain file copy of a live
     * WAL database can land mid-transaction; this writes a consistent snapshot
     * without stopping the server or touching the connection serving the
     * request. It also cannot run inside a transaction, which is why this is
     * called after logSession() rather than within it.
     */
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    try {
      db.exec("PRAGMA busy_timeout = 10000");
      db.exec(`VACUUM INTO '${out.replace(/\\/g, "/").replace(/'/g, "''")}'`);
    } finally {
      db.close();
    }

    prune();
    return out;
  } catch {
    return null;
  }
}
