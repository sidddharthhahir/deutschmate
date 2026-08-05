/**
 * Prove the mail settings work, before trusting a sign-in to them.
 *
 *   npm run mail:test you@example.com
 *
 * Worth its own command because the alternative is testing with a real invite,
 * and a failed invite burns a token, mails nobody, and looks identical to the
 * message going to spam. This says which transport ran and what the provider
 * said back.
 *
 * It sends nothing unless you name an address. With no argument it reports the
 * configuration and stops, which is the common case: "is this even on?"
 */
import "./load-env.mts";
import { from, mailReady, sendMail, transport } from "../src/lib/mail.ts";
import { testEmail } from "../src/lib/mail-templates.ts";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

const to = process.argv[2];
const via = transport();
const ready = mailReady();

console.log(`\n  transport   ${via}`);
console.log(`  from        ${from()}`);
if (via === "smtp") {
  const port = process.env.SMTP_PORT?.trim() || "587 (default)";
  console.log(`  host        ${process.env.SMTP_HOST?.trim() ?? "—"}`);
  console.log(`  port        ${port}`);
  /* Presence only. A terminal is not a place to print a mailbox password, and
     the only question worth answering is whether one is configured. */
  console.log(`  auth        ${process.env.SMTP_USER?.trim() ? "user + password set" : "none"}`);
}
if (via === "resend") {
  console.log(`  api key     ${process.env.RESEND_API_KEY?.trim() ? "set" : "unset"}`);
}

if (!ready.ok) {
  console.log(`\n  ${red("✗")} ${ready.why}\n`);
  process.exit(1);
}

if (via === "console") {
  console.log(
    `\n  ${dim("No provider configured, so links print to the server terminal.")}` +
      `\n  ${dim("That is the default and it is fine for one machine. To send real mail,")}` +
      `\n  ${dim("set SMTP_HOST (or RESEND_API_KEY) and DEUTSCHMATE_MAIL_FROM in .env.local.")}\n`,
  );
  process.exit(0);
}

if (!to) {
  console.log(`\n  ${green("✓")} configured. To send a real test:\n\n      npm run mail:test you@example.com\n`);
  process.exit(0);
}

console.log(`\n  sending to ${to} …`);
const res = await sendMail(testEmail(to, via));
if (res.ok) {
  console.log(
    `  ${green("✓")} accepted by the provider.\n\n` +
      `  ${dim("Accepted is not the same as delivered — check the inbox, and the spam")}\n` +
      `  ${dim("folder, which is where mail from a new sending domain usually lands.")}\n`,
  );
} else {
  console.log(`  ${red("✗")} ${res.error}\n`);
  process.exitCode = 1;
}
