import { all, get, run } from "./db.ts";
import { normalise } from "./who.ts";

/** Accounts, as rows. */

/*
 * No `email`. Sign-in is a username and a password and has been for a while;
 * nothing in the app ever collected an address, and every caller of createUser
 * — the routes, the test harness, walk.mts, probe-cookie.mts — passed a name
 * and nothing else. So the parameter, the lookup-by-address, the backfill and
 * normaliseEmail() in auth.ts were all reachable only from code that no longer
 * exists.
 *
 * The COLUMN stays in the database. Dropping it means rebuilding the table for
 * no gain, the migration entry has to remain anyway so older databases still
 * apply cleanly, and one legacy row still holds a value. It is simply not read
 * any more.
 */
export type User = {
  id: string;
  name: string;
  level: string;
};

const COLUMNS = "id, name, level";

/** Names are ids for the accounts that predate sign-in. */
export const normaliseName = normalise;

/** Create an account from a name, or return the existing one. */
export function createUser(name: string): User {
  const clean = normaliseName(name);

  const existing = get<User>(`SELECT ${COLUMNS} FROM user WHERE id = ?`, clean);
  if (existing) return existing;

  run("INSERT INTO user (id, name) VALUES (?, ?)", clean, clean);
  // No cards are created here. A new learner's deck is empty because they have
  // not met a word yet — see introduceWord() in srs.ts.
  return get<User>(`SELECT ${COLUMNS} FROM user WHERE id = ?`, clean)!;
}

export function userById(id: string): User | undefined {
  return get<User>(`SELECT ${COLUMNS} FROM user WHERE id = ?`, id);
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
