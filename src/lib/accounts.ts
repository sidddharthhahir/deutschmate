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

/** Whether anybody has an account yet — drives the first-run screen. */
export function anyUsers(): boolean {
  return Boolean(get<{ n: number }>("SELECT COUNT(*) AS n FROM user")?.n);
}

/** Everyone with a deck on this install. */
export function allUsers(): User[] {
  return all<User>(`SELECT ${COLUMNS} FROM user ORDER BY name LIMIT 200`);
}
