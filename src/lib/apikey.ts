import { get, run } from "./db.ts";
import { decrypt, encrypt, hintOf, secretsAvailable } from "./secrets.ts";

/**
 * Each learner's own Anthropic key: nobody can spend anybody else's and the
 * operator's bill does not grow with the number of people. Stored encrypted,
 * read back only to make a call — never returned to a browser, logged, or put
 * in a response.
 */

export type KeyState =
  | { state: "none" }
  | { state: "set"; hint: string; at: string }
  /** Stored but unreadable — usually a rotated master secret. */
  | { state: "unreadable" }
  /** No master secret, so this server will not hold one at all. */
  | { state: "unavailable" };

/** Shape only; `verifyKey` does the real call. Catches the paste that grabbed the wrong line. */
export function looksLikeKey(raw: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(raw.trim());
}

export function keyState(userId: string): KeyState {
  if (!secretsAvailable()) return { state: "unavailable" };
  const row = get<{
    api_key_enc: string | null;
    api_key_hint: string | null;
    api_key_at: string | null;
  }>("SELECT api_key_enc, api_key_hint, api_key_at FROM user WHERE id = ?", userId);
  if (!row?.api_key_enc) return { state: "none" };
  if (!decrypt(row.api_key_enc)) return { state: "unreadable" };
  return { state: "set", hint: row.api_key_hint ?? "????", at: row.api_key_at ?? "" };
}

export function setApiKey(userId: string, key: string): boolean {
  const k = key.trim();
  if (!looksLikeKey(k) || !secretsAvailable()) return false;
  run(
    "UPDATE user SET api_key_enc = ?, api_key_hint = ?, api_key_at = datetime('now') WHERE id = ?",
    encrypt(k),
    hintOf(k),
    userId,
  );
  return true;
}

export function clearApiKey(userId: string) {
  run(
    "UPDATE user SET api_key_enc = NULL, api_key_hint = NULL, api_key_at = NULL WHERE id = ?",
    userId,
  );
}

/**
 * Their key first, the server's as fallback. Null when there is neither, which
 * every caller treats as "unavailable" — the same path a spent budget takes.
 */
export function keyFor(userId: string): string | null {
  const row = get<{ api_key_enc: string | null }>(
    "SELECT api_key_enc FROM user WHERE id = ?",
    userId,
  );
  return decrypt(row?.api_key_enc) || serverApiKey() || null;
}

/**
 * Lives here, not env.ts, because env.ts imports this file — the dependency runs
 * one way. Both variable names, because the SDK honours both and a key in the
 * unread one is indistinguishable from no key.
 */
export function serverApiKey(): string {
  return (process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? "").trim();
}

export function anyStoredKeys(): boolean {
  return Boolean(
    get<{ n: number }>("SELECT COUNT(*) AS n FROM user WHERE api_key_enc IS NOT NULL")?.n,
  );
}

/** Theirs if set, else the deployment default. Zero is real and means no AI spend. */
export function budgetFor(userId: string, fallback: number): number {
  const cents = get<{ budget_cents: number | null }>(
    "SELECT budget_cents FROM user WHERE id = ?",
    userId,
  )?.budget_cents;
  return cents === null || cents === undefined ? fallback : cents / 100;
}

export function setBudget(userId: string, dollars: number | null) {
  run(
    "UPDATE user SET budget_cents = ? WHERE id = ?",
    dollars === null ? null : Math.max(0, Math.round(dollars * 100)),
    userId,
  );
}
