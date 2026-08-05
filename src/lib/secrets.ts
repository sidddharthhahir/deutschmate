import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * AES-256-GCM for things this server holds on somebody else's behalf — today, each learner's
 * Anthropic key.
 */

/** Fixed: there is one key and it is not a password. */
const SALT = "deutschmate:secrets:v1";
const ALGO = "aes-256-gcm";
/** GCM: a fresh IV per encryption is not optional — reuse breaks the cipher. */
const IV_BYTES = 12;
export const MIN_SECRET = 32;

let _key: Buffer | null = null;

/** scrypt-stretched so a hex string or a passphrase both work. Cached — scrypt is slow by design. */
function masterKey(): Buffer | null {
  if (_key) return _key;
  const raw = (process.env.DEUTSCHMATE_SECRET ?? "").trim();
  if (raw.length < MIN_SECRET) return null;
  _key = scryptSync(raw, SALT, 32);
  return _key;
}

export function secretsAvailable(): boolean {
  return masterKey() !== null;
}

/** `v1.<iv>.<tag>.<ciphertext>`, base64url. Versioned so a future algorithm is detectable. */
export function encrypt(plain: string): string {
  const key = masterKey();
  if (!key)
    throw new Error(
      "DEUTSCHMATE_SECRET is not set — refusing to store a secret",
    );
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

/** Null for every failure — no key, a rotated one, a corrupt row, a tampered tag. */
export function decrypt(packed: string | null | undefined): string | null {
  const key = masterKey();
  if (!key || !packed) return null;
  const [v, iv, tag, body] = packed.split(".");
  if (v !== "v1" || !iv || !tag || !body) return null;
  try {
    const d = createDecipheriv(ALGO, key, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      d.update(Buffer.from(body, "base64url")),
      d.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/** Last four characters, so Einstellungen can say which key is stored without showing it. */
export function hintOf(key: string): string {
  return key.trim().slice(-4);
}

/** Tests rotate the secret; nothing else should. */
export function forgetMasterKey() {
  _key = null;
}
