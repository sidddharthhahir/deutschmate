import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * SQLite via Node 24's built-in `node:sqlite`.
 *
 * Deliberately not better-sqlite3: that is a native module needing prebuilt
 * binaries or Visual Studio build tools on Windows, plus npm's allow-scripts
 * approval. `node:sqlite` ships with the runtime — nothing to compile, nothing
 * to approve, and it keeps the "runs offline with no external service"
 * guarantee (spec §17) genuinely free.
 */

/**
 * Where the database lives. Exported because the scripts need it too.
 *
 * Four of them used to hold their own copy of this expression and two of those
 * copies ignored DEUTSCHMATE_DB — so pointing the env var at another file made
 * the seeder write one database while the app read a different one, with no
 * error anywhere.
 */
export const DB_PATH = process.env.DEUTSCHMATE_DB
  ? path.resolve(process.env.DEUTSCHMATE_DB)
  : path.join(process.cwd(), "deutschmate.db");

let _db: DatabaseSync | null = null;

/**
 * Columns added to tables that already exist in someone's database.
 *
 * `CREATE TABLE IF NOT EXISTS` silently does nothing when the table is already
 * there, so adding a column to schema.sql does NOT apply it to an existing db —
 * you get "no such column" from the first index or query that uses it. SQLite
 * has no `ADD COLUMN IF NOT EXISTS`, so check PRAGMA table_info and add.
 *
 * Append-only. Never remove a line, never reorder.
 */
const MIGRATIONS: [table: string, column: string, decl: string][] = [
  ["video", "unit_id", "TEXT"],
  ["card", "suspended", "INTEGER NOT NULL DEFAULT 0"],
  // Sign-in. NULL for accounts that predate it; claimed on first sign-in.
  // The UNIQUE lives in idx_user_email because ALTER TABLE cannot add one.
  ["user", "email", "TEXT"],
];

export function migrate(db: DatabaseSync) {
  for (const [table, column, decl] of MIGRATIONS) {
    const exists = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(table);
    if (!exists) continue; // schema.sql just created it with the column present
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (cols.some((c) => c.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

/**
 * Split a SQL file into statements.
 *
 * A plain `sql.split(";")` looks fine until a comment contains a semicolon —
 * then the comment is cut in half, the second fragment leaks into the next
 * statement, and you get a syntax error pointing at a word from a sentence you
 * wrote for a human. Comments and string literals are skipped properly here so
 * schema.sql can be written as ordinary, well-annotated SQL.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;

  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];

    // String literal — copy verbatim, including any ; -- /* inside it.
    if (c === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          j += 2; // '' is an escaped quote, not the end
          continue;
        }
        if (sql[j] === "'") {
          j++;
          break;
        }
        j++;
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }

    if (c === "-" && next === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }

    if (c === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }

    if (c === ";") {
      out.push(buf);
      buf = "";
      i++;
      continue;
    }

    buf += c;
    i++;
  }

  out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * Schema is applied in two passes: tables first, then indexes, with migrations
 * in between. An index on a column added by a migration cannot run before it.
 */
export function applySchema(db: DatabaseSync, sql: string) {
  const statements = splitStatements(sql);
  const indexes = statements.filter((s) => /^CREATE\s+(UNIQUE\s+)?INDEX/i.test(s));
  const rest = statements.filter((s) => !/^CREATE\s+(UNIQUE\s+)?INDEX/i.test(s));

  for (const s of rest) db.exec(s);
  migrate(db);
  for (const s of indexes) db.exec(s);
}

export function getDb(): DatabaseSync {
  if (_db) return _db;
  const db = new DatabaseSync(DB_PATH);
  applySchema(db, readFileSync(path.join(process.cwd(), "src/lib/schema.sql"), "utf8"));
  _db = db;
  return db;
}

/** Row helpers — node:sqlite returns null-prototype objects, so re-wrap them. */
export function all<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): T[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = getDb().prepare(sql).all(...(params as any[]));
  return rows.map((r: unknown) => ({ ...(r as object) })) as T[];
}

export function get<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): T | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = getDb().prepare(sql).get(...(params as any[]));
  return row ? ({ ...row } as T) : undefined;
}

export function run(sql: string, ...params: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getDb().prepare(sql).run(...(params as any[]));
}

/** Wrap a function in a transaction. node:sqlite has no .transaction() helper. */
export function tx<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
