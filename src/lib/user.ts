import { get, run } from "./db";

export type User = {
  id: string;
  name: string;
  level: string;
  daily_goal_min: number;
  browse_batch_size: number;
};

/**
 * No auth (spec §10). A name is the identity; real auth arrives at user #5.
 * Two users, shared content, separate progress — the split that matters is in
 * the schema, not in an auth provider.
 */
export function currentUser(name = "sid"): User {
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "sid";
  let u = get<User>("SELECT * FROM user WHERE id = ?", clean);
  if (!u) {
    run("INSERT INTO user (id, name) VALUES (?, ?)", clean, clean);
    u = get<User>("SELECT * FROM user WHERE id = ?", clean)!;
    // No cards are created here. A new learner's deck is empty because they
    // have not met a word yet — see introduceWord() in srs.ts.
  }
  return u;
}

export function userFromRequest(req: Request): User {
  const url = new URL(req.url);
  return currentUser(url.searchParams.get("user") ?? "sid");
}
