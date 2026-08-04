// Explicit .ts extensions: env.ts imports this, and `npm run config` loads
// env.ts in plain Node, where the @/ alias and extensionless paths do not
// resolve. Same reason as apikey.ts.
import { get, run, all } from "./db.ts";
import { norm } from "./error-key.ts";

/**
 * What one learner's API key is allowed to pay into, on behalf of everyone.
 *
 * Three tables are written from live model calls and read by every account on
 * the install: `error_pattern`, `explanation`, and `word.mnemonic`. That
 * sharing is the point — spec §12's whole argument is that German learners make
 * a finite set of mistakes and read the same texts, so the table converges and
 * the cost of the second person to ask is zero. It was also written when one
 * person paid for everything, and it needs two things it never had now that
 * people bring their own keys and paste their own German:
 *
 *   1. A row must not contain text the learner did not expect to publish.
 *   2. A row must have an author, so it can be taken back.
 *
 * This module owns both. `error_pattern` and mnemonics stay global — their
 * inputs are the app's own words and short answer fragments, and an explanation
 * of "der → den" is the right answer for everyone. Sentence explanations are
 * shared only when the sentence is demonstrably the app's own content.
 */

/** The tables that hold German the app itself put on screen, and the column. */
const CONTENT: [table: string, column: string][] = [
  ["sentence", "de"],
  ["reading", "body"],
  ["word", "example_de"],
  ["grammar", "examples_json"],
  ["unit", "dialogue_json"],
  ["video", "segments_json"],
];

/**
 * Did this sentence come from the curriculum?
 *
 * Asked of the database rather than taken from the request. A client can say
 * "this one is fine to share" and be wrong — or be a page I write next month
 * that forgets to say anything — and the cost of believing it is somebody's
 * private letter in a table their flatmate reads.
 *
 * `instr`, not LIKE: a sentence containing % or _ is a wildcard under LIKE and
 * could match content it does not appear in. This must not produce false
 * positives; false negatives are free, because they only mean an explanation is
 * cached privately instead of shared.
 *
 * The scan is over content, which is tens of rows per table and read-only after
 * seeding, and it runs on the miss path only — the path that is about to spend
 * a second or two on a model call anyway.
 */
export function isAppContent(sentence: string): boolean {
  const needle = norm(sentence);
  /*
   * Too short to be evidence of anything.
   *
   * The check is a substring match, so a short string matches by accident:
   * "der" occurs in every text the app ships, and "im Haus" probably does too.
   * Treating those as app content would share them — the wrong direction to be
   * wrong in, since the whole point is deciding what may be published.
   *
   * Three words and a dozen characters. Below that it is cached per learner
   * instead, which costs a duplicate model call on a very short sentence and
   * nothing else.
   */
  if (needle.length < 12 || needle.split(" ").length < 3) return false;
  for (const [table, column] of CONTENT) {
    const hit = get<{ n: number }>(
      `SELECT 1 AS n FROM ${table} WHERE instr(lower(COALESCE(${column},'')), ?) > 0 LIMIT 1`,
      needle,
    );
    if (hit) return true;
  }
  return false;
}

/**
 * The cache key.
 *
 * A shared row is keyed by level and sentence, so everyone lands on the same
 * one. A private row carries its owner in the key, because `signature` is
 * UNIQUE: without the owner, the second person to ask about the same private
 * sentence would collide with the first person's row, be unable to read it, and
 * pay for a fresh answer on every single ask, forever.
 */
export function explanationKey(sentence: string, level: string, owner: string | null): string {
  const base = `${level}|${norm(sentence)}`;
  return owner ? `${base}|@${owner}` : base;
}

export type CachedExplanation = { body_md: string; shared: boolean };

/**
 * Look up an explanation this user is allowed to see.
 *
 * Whether the sentence is app content is decided first and decides which key to
 * look under, so the two kinds of row never shadow each other.
 */
export function findExplanation(
  sentence: string,
  level: string,
  userId: string,
): CachedExplanation | null {
  const shared = isAppContent(sentence);
  const sig = explanationKey(sentence, level, shared ? null : userId);
  const row = get<{ body_md: string; shared: number; created_by: string | null }>(
    "SELECT body_md, shared, created_by FROM explanation WHERE signature = ?",
    sig,
  );
  if (!row) return null;
  // Belt and braces. The key already separates the two, but a row that is not
  // shared and not this learner's must never be served, whatever the key says.
  if (!row.shared && row.created_by !== userId) return null;
  run("UPDATE explanation SET hits = hits + 1 WHERE signature = ?", sig);
  return { body_md: row.body_md, shared: Boolean(row.shared) };
}

/**
 * Write one back. Returns whether it went into the shared pool.
 *
 * The ON CONFLICT branch also adopts the row — it rewrites body, owner and
 * shared flag rather than only bumping hits. That is what upgrades a row left
 * by an older version of this app, which has no owner and no flag, the first
 * time somebody asks about the same sentence again.
 */
export function saveExplanation(
  sentence: string,
  level: string,
  userId: string,
  bodyMd: string,
): boolean {
  const shared = isAppContent(sentence);
  const sig = explanationKey(sentence, level, shared ? null : userId);
  run(
    `INSERT INTO explanation (signature, sentence, level, body_md, created_by, shared)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(signature) DO UPDATE
       SET body_md    = excluded.body_md,
           created_by = COALESCE(explanation.created_by, excluded.created_by),
           shared     = excluded.shared,
           hits       = explanation.hits + 1`,
    sig,
    sentence,
    level,
    bodyMd,
    userId,
    shared ? 1 : 0,
  );
  return shared;
}

export type CacheContribution = {
  /** Explanations only this learner can see. */
  privateRows: number;
  /** Explanations of app content they paid for, which everyone reads. */
  sharedRows: number;
  /** Mistake explanations they paid for. Always shared. */
  patterns: number;
};

/** What this learner has put into the cache. Counts only — never the text. */
export function contributions(userId: string): CacheContribution {
  const n = (sql: string) => get<{ n: number }>(sql, userId)?.n ?? 0;
  return {
    privateRows: n("SELECT COUNT(*) AS n FROM explanation WHERE created_by = ? AND shared = 0"),
    sharedRows: n("SELECT COUNT(*) AS n FROM explanation WHERE created_by = ? AND shared = 1"),
    patterns: n(
      "SELECT COUNT(*) AS n FROM error_pattern WHERE created_by = ? AND source = 'generated'",
    ),
  };
}

/**
 * Delete what this learner contributed.
 *
 * `scope: "private"` removes only their own unshared explanations — the ones
 * with their pasted German in them. `scope: "all"` also withdraws what they
 * contributed to the shared pool, which makes the app poorer for everybody and
 * is still their call: they paid for it and it is their text that seeded it.
 *
 * Prebuilt rows are never touched. They came with the app, cost nobody
 * anything, and deleting them would quietly break the offline explanation tier
 * for every account — the one thing that must keep working without a key.
 */
export function forgetContributions(userId: string, scope: "private" | "all"): number {
  let removed = 0;
  removed += run(
    "DELETE FROM explanation WHERE created_by = ? AND shared = 0",
    userId,
  ).changes as number;
  if (scope === "all") {
    removed += run("DELETE FROM explanation WHERE created_by = ? AND shared = 1", userId)
      .changes as number;
    removed += run(
      "DELETE FROM error_pattern WHERE created_by = ? AND source = 'generated'",
      userId,
    ).changes as number;
  }
  return removed;
}

/**
 * Rows nobody owns and nobody can reach.
 *
 * Only ever produced by a database that predates the `created_by` column and
 * escaped the migration. Reported by `npm run config` rather than deleted
 * behind the operator's back.
 */
export function orphanedRows(): number {
  return (
    all<{ n: number }>(
      "SELECT COUNT(*) AS n FROM explanation WHERE shared = 0 AND created_by IS NULL",
    )[0]?.n ?? 0
  );
}
