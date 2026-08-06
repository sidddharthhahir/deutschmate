import {
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";

/**
 * Passwords and recovery codes. `node:crypto` only, so the clone-and-run promise
 * holds — no native module, no build step, nothing to install.
 */

/** scrypt's own defaults, and the reason the cost is not lower. */
const N = 16384;
const KEYLEN = 64;
const SALT_BYTES = 16;

/* The numbers live in a crypto-free module so the sign-in form can state them. */
export { MIN_PASSWORD, MAX_PASSWORD } from "./password-rules.ts";
import { MIN_PASSWORD, MAX_PASSWORD } from "./password-rules.ts";

/** `s1$<salt>$<hash>`, base64url. Versioned so a future cost or algorithm is detectable. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(plain.normalize("NFKC"), salt, KEYLEN, { N });
  return `s1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/**
 * Constant-time, and false for every malformed input rather than throwing — a
 * stored value from an older version must not 500 the sign-in screen.
 */
export function verifyPassword(plain: string, stored: string | null): boolean {
  if (!plain || !stored) return false;
  const [v, salt64, key64] = stored.split("$");
  if (v !== "s1" || !salt64 || !key64) return false;
  try {
    const salt = Buffer.from(salt64, "base64url");
    const expected = Buffer.from(key64, "base64url");
    /*
     * Lengths checked BEFORE the compare, not inferred from the stored value.
     * base64url decoding does not throw on rubbish, it just yields fewer bytes —
     * and timingSafeEqual(empty, empty) is true, so "s1$!!$!!" would otherwise
     * have accepted every password on earth.
     */
    if (salt.length !== SALT_BYTES || expected.length !== KEYLEN) return false;
    const actual = scryptSync(plain.normalize("NFKC"), salt, KEYLEN, { N });
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Why a password is refused, in words a person can act on. Null when it is fine. */
export function passwordProblem(plain: string): string | null {
  if (plain.trim().length !== plain.length) {
    return "Keine Leerzeichen am Anfang oder Ende.";
  }
  if (plain.length < MIN_PASSWORD) {
    return `Mindestens ${MIN_PASSWORD} Zeichen.`;
  }
  if (plain.length > MAX_PASSWORD) return "Zu lang.";
  return null;
}

// -------------------------------------------------------------- recovery code

/**
 * No 0/O/1/I/L — this gets written on paper and typed back months later, and the
 * pairs people confuse are the ones that turn a recovery into a support request.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUPS = 4;
const PER_GROUP = 4;

/** `X7K2-9PQR-M4TW-BH3D`. ~79 bits, and it is only ever shown once. */
export function newRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let s = "";
    for (let i = 0; i < PER_GROUP; i++)
      s += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(s);
  }
  return groups.join("-");
}

/**
 * Dashes, spaces and case forgiven — it was copied off paper. No confusable-letter
 * mapping, because ALPHABET already excludes every character people mix up.
 */
export function normaliseRecoveryCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Stored as a plain sha256, not scrypt: it is 79 bits of uniform randomness that
 * this server generated, so there is no dictionary to run against it. The reason
 * a password needs scrypt is that a person chose it.
 */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normaliseRecoveryCode(code)).digest("hex");
}

export function verifyRecoveryCode(
  code: string,
  stored: string | null,
): boolean {
  if (!code || !stored) return false;
  const a = Buffer.from(hashRecoveryCode(code), "hex");
  const b = Buffer.from(stored, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
