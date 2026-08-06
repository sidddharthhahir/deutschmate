import { all, get, run } from "./db.ts";
import { normalise } from "./who.ts";
import { normaliseEmail } from "./auth.ts";

/** Accounts, as rows. */

export type User = {
  id: string;
  name: string;
  email: string | null;
  level: string;
};

const COLUMNS = "id, name, email, level";

/** Names are ids for the accounts that predate sign-in. */
export const normaliseName = normalise;

/** A new account's id is random, not its name. */
function newId(): string {
  return `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Create an account from a name, or return the existing one. */
export function createUser(name: string, email?: string | null): User {
  const clean = normaliseName(name);
  const addr = email ? normaliseEmail(email) : null;

  if (addr) {
    const byEmail = get<User>(
      `SELECT ${COLUMNS} FROM user WHERE email = ?`,
      addr,
    );
    if (byEmail) return byEmail;
  }

  const existing = get<User>(`SELECT ${COLUMNS} FROM user WHERE id = ?`, clean);
  if (existing) {
    if (addr && !existing.email) {
      run("UPDATE user SET email = ? WHERE id = ?", addr, existing.id);
      return { ...existing, email: addr };
    }
    return existing;
  }

  run(
    "INSERT INTO user (id, name, email) VALUES (?, ?, ?)",
    clean,
    clean,
    addr,
  );
  // No cards are created here. A new learner's deck is empty because they have
  // not met a word yet — see introduceWord() in srs.ts.
  return get<User>(`SELECT ${COLUMNS} FROM user WHERE id = ?`, clean)!;
}

/** Create an account from an address alone. Gets an opaque id. */
export function createUserByEmail(email: string): User | null {
  const addr = normaliseEmail(email);
  if (!addr) return null;

  const existing = get<User>(
    `SELECT ${COLUMNS} FROM user WHERE email = ?`,
    addr,
  );
  if (existing) return existing;

  const id = newId();
  /* Display name from the local part until they change it, made unique by the
     id — `name` is UNIQUE and two people can both be anna@ somewhere. */
  const base = normalise(addr.split("@")[0]) || "lerner";
  const taken = get<{ id: string }>("SELECT id FROM user WHERE name = ?", base);
  run(
    "INSERT INTO user (id, name, email) VALUES (?, ?, ?)",
    id,
    taken ? `${base}-${id.slice(-4)}` : base,
    addr,
  );
  return get<User>(`SELECT ${COLUMNS} FROM user WHERE id = ?`, id)!;
}

export function userById(id: string): User | undefined {
  return get<User>(`SELECT ${COLUMNS} FROM user WHERE id = ?`, id);
}

export function userByEmail(email: string): User | undefined {
  const addr = normaliseEmail(email);
  return addr
    ? get<User>(`SELECT ${COLUMNS} FROM user WHERE email = ?`, addr)
    : undefined;
}

// ------------------------------------------------------- username + password

/**
 * A username is the login identity, so it has to survive being typed from memory:
 * lower case, no spaces, no punctuation. Same normalise() the rest of the app
 * uses, so a name and its id never disagree.
 */
export function usernameProblem(raw: string): string | null {
  const clean = raw.trim();
  if (clean.length < 2) return "Mindestens 2 Zeichen.";
  if (clean.length > 32) return "Höchstens 32 Zeichen.";
  if (!/^[A-Za-z0-9_-]+$/.test(clean)) {
    return "Nur Buchstaben, Zahlen, - und _.";
  }
  return null;
}

export function userByName(name: string): User | undefined {
  return get<User>(
    `SELECT ${COLUMNS} FROM user WHERE name = ?`,
    normalise(name),
  );
}

/** The stored credentials. Separate from `User` so a hash is never on an object a page renders. */
export function credentialsFor(
  userId: string,
): { password_hash: string | null; recovery_hash: string | null } | undefined {
  return get(
    "SELECT password_hash, recovery_hash FROM user WHERE id = ?",
    userId,
  );
}

export function setPasswordHash(userId: string, hash: string) {
  run("UPDATE user SET password_hash = ? WHERE id = ?", hash, userId);
}

export function setRecoveryHash(userId: string, hash: string) {
  run("UPDATE user SET recovery_hash = ? WHERE id = ?", hash, userId);
}

/**
 * A new account, or null when the username is taken. The caller hashes — this
 * module never sees a plaintext password.
 */
export function createUserWithPassword(
  name: string,
  passwordHash: string,
  recoveryHash: string,
): User | null {
  const clean = normalise(name);
  if (userByName(clean)) return null;
  run(
    "INSERT INTO user (id, name, password_hash, recovery_hash) VALUES (?, ?, ?, ?)",
    clean,
    clean,
    passwordHash,
    recoveryHash,
  );
  return get<User>(`SELECT ${COLUMNS} FROM user WHERE id = ?`, clean)!;
}

/** Whether anybody has an account yet — drives the first-run screen. */
export function anyUsers(): boolean {
  return Boolean(get<{ n: number }>("SELECT COUNT(*) AS n FROM user")?.n);
}

/** Everyone with a deck on this install. */
export function allUsers(): User[] {
  return all<User>(`SELECT ${COLUMNS} FROM user ORDER BY name LIMIT 200`);
}
