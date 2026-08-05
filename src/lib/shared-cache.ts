// Explicit .ts extensions: env.ts imports this and `npm run config` loads env.ts in
// plain Node, where the @/ alias does not resolve. Same reason as apikey.ts.
import { get, run, all } from "./db.ts";
import { norm } from "./error-key.ts";

/**
 * What one learner's key may pay into on everyone's behalf. Mistake patterns and
 * mnemonics stay global — their inputs are the app's own words. Sentence
 * explanations are shared only when the sentence is demonstrably app content.
 */
const CONTENT: [table: string, column: string][] = [
  ["sentence", "de"],
  ["reading", "body"],
  ["word", "example_de"],
  ["grammar", "examples_json"],
  ["unit", "dialogue_json"],
  ["video", "segments_json"],
];

/**
 * Asked of the database, never taken from the request — a client claiming "this one
 * is fine to share" can be wrong, and the cost is somebody's private letter in a
 * table their flatmate reads. `instr`, not LIKE: a % or _ in the sentence is a
 * wildcard and could match content it does not appear in. The length floor is the
 * same rule — "der" occurs in every text the app ships.
 */
export function isAppContent(sentence: string): boolean {
  const needle = norm(sentence);
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
 * A private row carries its owner in the key because `signature` is UNIQUE — without
 * it the second person to ask about the same private sentence collides with the
 * first, cannot read it, and pays for a fresh answer on every ask forever.
 */
export function explanationKey(sentence: string, level: string, owner: string | null): string {
  const base = `${level}|${norm(sentence)}`;
  return owner ? `${base}|@${owner}` : base;
}

export type CachedExplanation = { body_md: string; shared: boolean };

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
  // Belt and braces: a row that is not shared and not this learner's is never
  // served, whatever the key says.
  if (!row.shared && row.created_by !== userId) return null;
  run("UPDATE explanation SET hits = hits + 1 WHERE signature = ?", sig);
  return { body_md: row.body_md, shared: Boolean(row.shared) };
}

/** The conflict branch adopts the row, which gives an ownerless one from an older version an author. */
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
 * "private" drops their own unshared rows; "all" also withdraws what they gave the
 * shared pool. Prebuilt rows are never touched — the offline explanation tier
 * depends on them and they cost nobody anything.
 */
export function forgetContributions(userId: string, scope: "private" | "all"): number {
  let removed = run("DELETE FROM explanation WHERE created_by = ? AND shared = 0", userId)
    .changes as number;
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

/** Only from a database predating created_by. Reported by `npm run config`, never auto-deleted. */
export function orphanedRows(): number {
  return (
    all<{ n: number }>(
      "SELECT COUNT(*) AS n FROM explanation WHERE shared = 0 AND created_by IS NULL",
    )[0]?.n ?? 0
  );
}
