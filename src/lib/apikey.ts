import { get, run } from "./db.ts";
import { decrypt, encrypt, hintOf, secretsAvailable } from "./secrets.ts";

/**
 * Each learner's own Anthropic key.
 *
 * The whole economic model of this app: the course is free and runs on nothing
 * but this machine, and the four features that need a model run on the
 * learner's own credential. Nobody can spend anybody else's, the operator's
 * bill does not grow with the number of people, and the app degrades to its
 * already-built offline path for anyone who has not added one.
 *
 * Stored encrypted (lib/secrets.ts). Read back only to make a call — never
 * returned to a browser, never logged, never in an HTTP response.
 */

/** What the settings page is allowed to know. */
export type KeyState =
  | { state: "none" }
  | { state: "set"; hint: string; at: string }
  /** Stored, but this server cannot read it — usually a rotated master secret. */
  | { state: "unreadable" }
  /** The server has no master secret, so it will not hold one at all. */
  | { state: "unavailable" };

/**
 * Does this look like an Anthropic key?
 *
 * A shape check, not a validity check — only a call decides that, and
 * `verifyKey` does one. This exists to catch the paste that grabbed the wrong
 * line, before it is encrypted and stored and silently fails every request.
 */
export function looksLikeKey(raw: string): boolean {
  const k = raw.trim();
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k);
}

export function keyState(userId: string): KeyState {
  if (!secretsAvailable()) return { state: "unavailable" };
  const row = get<{ api_key_enc: string | null; api_key_hint: string | null; api_key_at: string | null }>(
    "SELECT api_key_enc, api_key_hint, api_key_at FROM user WHERE id = ?",
    userId,
  );
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
 * The key to call with, for this learner.
 *
 * Their own first. The server's own key — if the operator set one — is the
 * fallback, which keeps a single-user install working exactly as it did and
 * gives a small group the option of sharing one. On a public deployment there
 * simply is no server key, so there is nothing to fall back to.
 *
 * Returns null when there is neither, and every caller treats that as "this
 * feature is unavailable", which is the same path a spent budget takes and is
 * already built and tested.
 */
export function keyFor(userId: string): string | null {
  const row = get<{ api_key_enc: string | null }>(
    "SELECT api_key_enc FROM user WHERE id = ?",
    userId,
  );
  const own = decrypt(row?.api_key_enc);
  if (own) return own;
  return serverApiKey() || null;
}

/**
 * The app's own credential, if the operator set one.
 *
 * Lives here rather than in env.ts because env.ts imports this file, so the
 * dependency only runs one way. env.ts re-exports it, and `npm run config`
 * reports its presence — never its value.
 *
 * Two variable names because the Anthropic SDK honours both, and a key in the
 * one this app did not read is indistinguishable from no key at all.
 */
export function serverApiKey(): string {
  return (process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? "").trim();
}

/** Whether any account on this install is holding an encrypted key. */
export function anyStoredKeys(): boolean {
  return Boolean(
    get<{ n: number }>("SELECT COUNT(*) AS n FROM user WHERE api_key_enc IS NOT NULL")?.n,
  );
}

// ------------------------------------------------------------------ budget
/**
 * This learner's monthly ceiling, in dollars.
 *
 * Theirs if they set one, otherwise the deployment default. Zero is a real
 * setting and means "no AI spending" — which, now that the money is theirs, is
 * a legitimate way to use the app rather than a broken state.
 */
export function budgetFor(userId: string, fallback: number): number {
  const row = get<{ budget_cents: number | null }>(
    "SELECT budget_cents FROM user WHERE id = ?",
    userId,
  );
  const cents = row?.budget_cents;
  return cents === null || cents === undefined ? fallback : cents / 100;
}

export function setBudget(userId: string, dollars: number | null) {
  run(
    "UPDATE user SET budget_cents = ? WHERE id = ?",
    dollars === null ? null : Math.max(0, Math.round(dollars * 100)),
    userId,
  );
}
