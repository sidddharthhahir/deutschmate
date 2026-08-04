import { all, get, run } from "./db.ts";
import { DEFAULT_USER, normalise } from "./who.ts";
import { normaliseEmail } from "./auth.ts";

/**
 * Accounts, as rows.
 *
 * Split from lib/user.ts because that one imports `next/headers` and
 * `next/navigation` to read the session cookie, and anything importing it can
 * therefore only run inside a request. `scripts/invite.mts` — the operator's
 * way out of a lockout — has to work from a terminal, so the half that only
 * touches the database lives here.
 */

export type User = {
  id: string;
  name: string;
  email: string | null;
  level: string;
};

const COLUMNS = "id, name, email, level";

/** Names are ids for the accounts that predate sign-in. */
export const normaliseName = normalise;

/**
 * A new account's id is random, not its name.
 *
 * The accounts that already exist are keyed by the name typed to create them,
 * because that is what identity used to be. A name is guessable, it leaks who
 * uses the install, and people change them. Every progress table references
 * this id with ON DELETE CASCADE and SQLite has no ON UPDATE CASCADE, so the
 * old rows keep their old ids rather than being rewritten under live data —
 * the id is internal now, so nothing can tell the difference.
 */
function newId(): string {
  return `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create an account from a name, or return the existing one.
 *
 * The trusted test path uses this; so does the legacy bootstrap. Sole place
 * besides createUserByEmail that inserts into `user` — it used to happen inside
 * every request, so `{"user":"aaa1"}` on any POST minted an account.
 */
export function createUser(name: string, email?: string | null): User {
  const clean = normaliseName(name);
  const addr = email ? normaliseEmail(email) : null;

  if (addr) {
    const byEmail = get<User>(`SELECT ${COLUMNS} FROM user WHERE email = ?`, addr);
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

  run("INSERT INTO user (id, name, email) VALUES (?, ?, ?)", clean, clean, addr);
  // No cards are created here. A new learner's deck is empty because they have
  // not met a word yet — see introduceWord() in srs.ts.
  return get<User>(`SELECT ${COLUMNS} FROM user WHERE id = ?`, clean)!;
}

/** Create an account from an address alone. Gets an opaque id. */
export function createUserByEmail(email: string): User | null {
  const addr = normaliseEmail(email);
  if (!addr) return null;

  const existing = get<User>(`SELECT ${COLUMNS} FROM user WHERE email = ?`, addr);
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
  return addr ? get<User>(`SELECT ${COLUMNS} FROM user WHERE email = ?`, addr) : undefined;
}

/** Whether anybody has an account yet — drives the first-run screen. */
export function anyUsers(): boolean {
  return Boolean(get<{ n: number }>("SELECT COUNT(*) AS n FROM user")?.n);
}

/**
 * Everyone with a deck on this install.
 *
 * Bounded, because /wer renders one row each and this used to be unbounded —
 * fine for two flatmates, a page of a thousand names for anything else.
 */
export function allUsers(): User[] {
  return all<User>(`SELECT ${COLUMNS} FROM user ORDER BY name LIMIT 200`);
}

export { DEFAULT_USER };
