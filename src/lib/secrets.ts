import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Encrypting things this server is holding on somebody else's behalf.
 *
 * Right now that is one thing: each learner's Anthropic API key. That is a live
 * credential belonging to a colleague, and losing it is a different order of
 * incident from losing a flashcard deck — so it is never written to the
 * database in a form the database can be read for.
 *
 * AES-256-GCM. Authenticated, so a tampered ciphertext fails to decrypt rather
 * than decrypting to something else. A fresh 12-byte IV per encryption, which
 * for GCM is not optional: reusing one with the same key breaks the cipher
 * outright.
 *
 * WHAT THIS DOES AND DOES NOT BUY YOU
 *
 * It protects a database that leaves the machine — a backup on a laptop, a file
 * copied off a box, a stolen disk. It does NOT protect against someone who can
 * already read the server's environment, because the key to decrypt is there.
 * That is the honest limit and it is worth stating rather than implying more:
 * the realistic threat for a five-person install is a mislaid backup, and this
 * is the thing that fixes it.
 *
 * `node:crypto`, so no dependency — the same reasoning that chose node:sqlite.
 */

/** Fixed, because there is one key and it is not a password. */
const SALT = "deutschmate:secrets:v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

/** Shortest master secret that is not a false sense of safety. */
export const MIN_SECRET = 32;

let _key: Buffer | null = null;

/**
 * The master key, derived from DEUTSCHMATE_SECRET.
 *
 * Accepts any string of at least 32 characters and stretches it with scrypt, so
 * `npm run setup` can generate 64 hex characters and a human can paste a long
 * passphrase, and both end up as 32 bytes. Cached: scrypt is deliberately slow
 * and this runs on every decrypt.
 */
function masterKey(): Buffer | null {
  if (_key) return _key;
  const raw = (process.env.DEUTSCHMATE_SECRET ?? "").trim();
  if (raw.length < MIN_SECRET) return null;
  _key = scryptSync(raw, SALT, 32);
  return _key;
}

/** Whether this server can store a secret at all. */
export function secretsAvailable(): boolean {
  return masterKey() !== null;
}

/**
 * Encrypt. Returns one string, because one column is one thing to migrate and
 * one thing to get wrong.
 *
 * `v1.<iv>.<tag>.<ciphertext>`, all base64url. The version prefix is there so a
 * future change of algorithm can be detected rather than mis-decrypted.
 */
export function encrypt(plain: string): string {
  const key = masterKey();
  if (!key) throw new Error("DEUTSCHMATE_SECRET is not set — refusing to store a secret");
  const iv = randomBytes(IV_BYTES);
  const c = createCipheriv(ALGO, key, iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    c.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

/**
 * Decrypt, or null.
 *
 * Null for every failure, deliberately, and the caller treats all of them the
 * same: no master key, a rotated one, a corrupt row, a tampered ciphertext. The
 * learner's experience is identical in each case — the app says it cannot read
 * their stored key and asks them to paste it again — and that is the correct
 * answer to all four. Distinguishing them would only tell an attacker which of
 * their guesses was closer.
 */
export function decrypt(packed: string | null | undefined): string | null {
  const key = masterKey();
  if (!key || !packed) return null;
  const [v, iv, tag, body] = packed.split(".");
  if (v !== "v1" || !iv || !tag || !body) return null;
  try {
    const d = createDecipheriv(ALGO, key, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * The last four characters, for showing a learner which key is stored.
 *
 * Not a secret and not enough to be one. It exists so the settings page can say
 * "…4f2a" rather than either printing the key or showing nothing and leaving
 * somebody unsure whether they ever saved it.
 */
export function hintOf(key: string): string {
  return key.trim().slice(-4);
}

/** Reset the cached key. Tests rotate the secret; nothing else should. */
export function forgetMasterKey() {
  _key = null;
}
