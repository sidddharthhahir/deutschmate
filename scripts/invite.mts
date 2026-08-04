/**
 * Make a sign-in link from the command line.
 *
 *   npm run invite you@example.com
 *
 * The operator's door. Email delivery is not configured — deliberately, so this
 * app still runs with no network and no provider account (spec §17) — so the
 * link is printed here and you hand it over however you like.
 *
 * Also the way OUT of a lockout: if nobody can sign in, whoever has the machine
 * can always mint a link. That matters because the alternative to this script
 * is editing the database by hand.
 *
 * An address with no account gets one, with an empty deck. An existing account
 * keeps everything it has — including the two name-keyed accounts from before
 * sign-in existed, which claim an address the first time one is attached.
 */
import { createSignInToken, deliver, normaliseEmail, sweepExpired } from "../src/lib/auth.ts";
import { allUsers, createUserByEmail, userByEmail, userById } from "../src/lib/accounts.ts";
import { run } from "../src/lib/db.ts";

const arg = process.argv[2];
const claim = process.argv[3]; // optional: attach the address to an existing id

if (!arg) {
  console.log("\n  npm run invite <email> [existing-account-id]\n");
  const users = allUsers();
  if (users.length) {
    console.log("  Accounts on this install:\n");
    for (const u of users) {
      console.log(`    ${u.id.padEnd(24)} ${u.name.padEnd(16)} ${u.email ?? "— no address"}`);
    }
    console.log(
      "\n  An account with no address cannot sign in yet. Give it one:\n" +
        `    npm run invite you@example.com ${users.find((u) => !u.email)?.id ?? "<id>"}\n`,
    );
  } else {
    console.log("  No accounts yet — the first address you invite creates one.\n");
  }
  process.exit(1);
}

const email = normaliseEmail(arg);
if (!email) {
  console.error(`\n  "${arg}" does not look like an email address.\n`);
  process.exit(1);
}

sweepExpired();

let user = userByEmail(email);

if (!user && claim) {
  /* Attach the address to an account that predates sign-in, rather than making
     a second one beside it — the whole point is to keep the existing deck. */
  const target = userById(claim);
  if (!target) {
    console.error(`\n  No account with id "${claim}".\n`);
    process.exit(1);
  }
  if (target.email) {
    console.error(`\n  "${claim}" already uses ${target.email}.\n`);
    process.exit(1);
  }
  run("UPDATE user SET email = ? WHERE id = ?", email, target.id);
  user = { ...target, email };
  console.log(`\n  ${target.name} (${target.id}) now signs in as ${email}`);
}

if (!user) {
  user = createUserByEmail(email)!;
  console.log(`\n  New account: ${user.name} (${user.id})`);
}

const base = process.env.DEUTSCHMATE_URL || "http://localhost:3000";
const t = createSignInToken(user.id, base);
deliver(email, t.url, t.expiresAt);
