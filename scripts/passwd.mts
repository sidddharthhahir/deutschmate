/**
 * The operator's backstop: set somebody's password when they have forgotten both
 * it and their recovery code. There is no email to send a reset to, on purpose —
 * so this is the door, and it needs a shell on the machine.
 *
 *   npm run passwd                  list the accounts
 *   npm run passwd <username>       set a password, printed once
 */
import "./load-env.mts";
import {
  allUsers,
  userByName,
  setPasswordHash,
  setRecoveryHash,
} from "../src/lib/accounts.ts";
import {
  hashPassword,
  newRecoveryCode,
  hashRecoveryCode,
  MIN_PASSWORD,
} from "../src/lib/password.ts";
import { randomBytes } from "node:crypto";
import { destroyAllSessions, sweepExpired } from "../src/lib/auth.ts";

const name = process.argv[2];
const given = process.argv[3];

if (!name) {
  const users = allUsers();
  console.log("\n  npm run passwd <username> [password]\n");
  if (users.length) {
    console.log("  Accounts on this install:\n");
    for (const u of users) {
      console.log(`    ${u.name.padEnd(24)} ${u.level}`);
    }
    console.log("");
  } else {
    console.log(
      "  No accounts yet — make the first one on the sign-in screen.\n",
    );
  }
  process.exit(1);
}

const user = userByName(name);
if (!user) {
  console.error(`\n  No account called "${name}".\n`);
  process.exit(1);
}

if (given && given.length < MIN_PASSWORD) {
  console.error(`\n  A password needs at least ${MIN_PASSWORD} characters.\n`);
  process.exit(1);
}

/* Generated when none is given, because an operator picking passwords for other
   people picks the same one twice. */
const password = given || randomBytes(9).toString("base64url");
const code = newRecoveryCode();

sweepExpired();
setPasswordHash(user.id, hashPassword(password));
setRecoveryHash(user.id, hashRecoveryCode(code));
/* Every existing session dies. A password reset that leaves the old sessions
   signed in has not actually locked anybody out. */
destroyAllSessions(user.id);

console.log(
  [
    "",
    "  ┌─ DeutschMate — password set " + "─".repeat(28),
    `  │  user:     ${user.name}`,
    `  │  password: ${password}`,
    `  │  recovery: ${code}`,
    "  │",
    "  │  Shown once. Every device signed in as this account was signed out.",
    "  └" + "─".repeat(58),
    "",
  ].join("\n"),
);
