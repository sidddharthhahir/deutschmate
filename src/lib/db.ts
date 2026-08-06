import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";

/** SQLite via Node 24's built-in `node:sqlite`. */

/** Where the database lives. */
export const DB_PATH = process.env.DEUTSCHMATE_DB
  ? path.resolve(process.env.DEUTSCHMATE_DB)
  : path.join(process.cwd(), "deutschmate.db");

let _db: DatabaseSync | null = null;

/** Columns added to tables that already exist in someone's database. */
const MIGRATIONS: [
  table: string,
  column: string,
  decl: string,
  after?: string,
][] = [
  ["video", "unit_id", "TEXT"],
  ["card", "suspended", "INTEGER NOT NULL DEFAULT 0"],
  // Sign-in. NULL for accounts that predate it; claimed on first sign-in.
  // The UNIQUE lives in idx_user_email because ALTER TABLE cannot add one.
  ["user", "email", "TEXT"],
  // Each learner's own Anthropic key, encrypted, plus their own spend cap.
  ["user", "api_key_enc", "TEXT"],
  ["user", "api_key_hint", "TEXT"],
  ["user", "api_key_at", "TEXT"],
  ["user", "budget_cents", "INTEGER"],
  // A video can now be a direct mp4 (Deutsche Welle's own CDN) rather than a
  // YouTube embed. See the comment on the video table in schema.sql.
  ["video", "src_url", "TEXT"],
  ["video", "duration", "INTEGER"],
  /*
   * Username and password sign-in. `name` is already UNIQUE, so it is the
   * username — no second identity column. `email` stays for the accounts that
   * have one; nothing reads it for sign-in any more.
   */
  ["user", "password_hash", "TEXT"],
  ["user", "recovery_hash", "TEXT"],
  // Who paid for a cached row, and whether it may be served to other accounts.
  ["error_pattern", "created_by", "TEXT"],
  ["explanation", "created_by", "TEXT"],
  [
    "explanation",
    "shared",
    "INTEGER NOT NULL DEFAULT 0",
    /*
     * Sorting the rows that already exist, once. They have no owner to attribute them to, the new
     * lookup cannot reach them, and they are the exact thing this column exists to stop.
     */
    `UPDATE explanation SET shared = 1
      WHERE EXISTS (SELECT 1 FROM sentence s WHERE instr(lower(s.de),    lower(explanation.sentence)) > 0)
         OR EXISTS (SELECT 1 FROM reading  r WHERE instr(lower(r.body),  lower(explanation.sentence)) > 0)
         OR EXISTS (SELECT 1 FROM word     w WHERE instr(lower(COALESCE(w.example_de,'')), lower(explanation.sentence)) > 0)
         OR EXISTS (SELECT 1 FROM grammar  g WHERE instr(lower(g.examples_json), lower(explanation.sentence)) > 0)
         OR EXISTS (SELECT 1 FROM unit     u WHERE instr(lower(COALESCE(u.dialogue_json,'')), lower(explanation.sentence)) > 0)
         OR EXISTS (SELECT 1 FROM video    v WHERE instr(lower(v.segments_json), lower(explanation.sentence)) > 0);
     DELETE FROM explanation WHERE shared = 0;`,
  ],
];

export function migrate(db: DatabaseSync) {
  for (const [table, column, decl, after] of MIGRATIONS) {
    const exists = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(table);
    if (!exists) continue; // schema.sql just created it with the column present
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
      name: string;
    }[];
    if (cols.some((c) => c.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
    // Runs exactly once, in the same startup that adds the column — the next
    // one sees the column present and skips both. A fresh database created by
    // schema.sql never reaches here, and has nothing to backfill anyway.
    if (after) db.exec(after);
  }
}

/** Split a SQL file into statements. */
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
  const indexes = statements.filter((s) =>
    /^CREATE\s+(UNIQUE\s+)?INDEX/i.test(s),
  );
  const rest = statements.filter(
    (s) => !/^CREATE\s+(UNIQUE\s+)?INDEX/i.test(s),
  );

  for (const s of rest) db.exec(s);
  migrate(db);
  for (const s of indexes) db.exec(s);
}

export function getDb(): DatabaseSync {
  if (_db) return _db;
  const db = new DatabaseSync(DB_PATH);
  applySchema(
    db,
    readFileSync(path.join(process.cwd(), "src/lib/schema.sql"), "utf8"),
  );
  _db = db;
  return db;
}

/** Row helpers — node:sqlite returns null-prototype objects, so re-wrap them. */
export function all<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): T[] {
  const rows = getDb()
    .prepare(sql)
    .all(...(params as never[]));
  return rows.map((r: unknown) => ({ ...(r as object) })) as T[];
}

export function get<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): T | undefined {
  const row = getDb()
    .prepare(sql)
    .get(...(params as never[]));
  return row ? ({ ...row } as T) : undefined;
}

export function run(sql: string, ...params: unknown[]) {
  return getDb()
    .prepare(sql)
    .run(...(params as never[]));
}

/** Nesting depth, so an inner tx() joins the outer one instead of throwing. */
let _depth = 0;

/** Wrap a function in a transaction. node:sqlite has no .transaction() helper. */
export function tx<T>(fn: () => T): T {
  const db = getDb();
  if (_depth > 0) {
    // Already inside one. The outer commit or rollback covers this work.
    _depth++;
    try {
      return fn();
    } finally {
      _depth--;
    }
  }

  db.exec("BEGIN IMMEDIATE");
  _depth = 1;
  try {
    const out = fn();
    _depth = 0;
    db.exec("COMMIT");
    return out;
  } catch (e) {
    _depth = 0;
    try {
      db.exec("ROLLBACK");
    } catch {
      /* nothing to roll back — do not mask the error that got us here */
    }
    throw e;
  }
}
