/**
 * Sending the one email this app sends.
 * needs: nothing
 */
import { ok, eq, section, done } from "./harness.mts";
import {
  from,
  fromWillBeRewritten,
  mailReady,
  transport,
} from "../src/lib/mail.ts";
import { signInEmail, testEmail } from "../src/lib/mail-templates.ts";

/* The process environment is the input to every function here, so it is saved
   whole and restored at the end rather than per-check. */
const KEYS = [
  "DEUTSCHMATE_MAIL",
  "DEUTSCHMATE_MAIL_FROM",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_SECURE",
  "RESEND_API_KEY",
];
const SAVED = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const restore = () => {
  for (const k of KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
};
const clear = () => {
  for (const k of KEYS) delete process.env[k];
};
process.on("exit", restore);
clear();

section("with nothing set, nothing is sent anywhere");
eq(transport(), "console", "the default is the terminal");
eq(mailReady().ok, true, "and it is always ready — that is the point of it");

section(
  "credentials switch the transport on, without a second switch to forget",
);
process.env.SMTP_HOST = "smtp.example.com";
eq(transport(), "smtp", "SMTP_HOST alone is enough");
clear();
process.env.RESEND_API_KEY = "re_test";
eq(transport(), "resend", "so is an API key");
clear();

section("an explicit setting wins, including turning a live provider off");
process.env.SMTP_HOST = "smtp.example.com";
process.env.DEUTSCHMATE_MAIL = "console";
eq(
  transport(),
  "console",
  "console with SMTP still configured — a way to stop sending without losing the settings",
);
process.env.DEUTSCHMATE_MAIL = "nonsense";
eq(
  transport(),
  "smtp",
  "an unrecognised value is ignored rather than silently disabling mail",
);
clear();

section("half-configured is caught, because the symptom would be silence");
process.env.SMTP_HOST = "smtp.example.com";
eq(mailReady().ok, false, "no From address");
ok(/MAIL_FROM/.test(mailReady().why ?? ""), "and it says which");

process.env.DEUTSCHMATE_MAIL_FROM = "DeutschMate <no-reply@example.com>";
eq(
  mailReady().ok,
  true,
  "host plus From is enough — an internal relay needs no login",
);

process.env.SMTP_USER = "someone";
eq(mailReady().ok, false, "a user with no password is not");
ok(/SMTP_PASS/.test(mailReady().why ?? ""), "and it says which");
process.env.SMTP_PASS = "app-password";
eq(mailReady().ok, true, "both, and it is ready");
clear();

process.env.DEUTSCHMATE_MAIL = "resend";
process.env.DEUTSCHMATE_MAIL_FROM = "a@example.com";
eq(mailReady().ok, false, "resend with no key");
process.env.RESEND_API_KEY = "re_test";
eq(mailReady().ok, true, "resend with one");
clear();

section("the From address");
eq(
  from().includes("localhost"),
  true,
  "unset falls back to something obviously local",
);
process.env.DEUTSCHMATE_MAIL_FROM = "DeutschMate <hallo@example.com>";
eq(from(), "DeutschMate <hallo@example.com>", "a display name survives intact");
clear();

section("the link is in BOTH parts of the message");
const URL =
  "https://deutschmate.example.com/api/auth/callback?token=abc123&x=1";
const mail = signInEmail("anna@example.de", URL, 20);
eq(mail.to, "anna@example.de", "addressed to the person who asked");
ok(mail.text.includes(URL), "plain text carries the raw link");
ok(mail.html.includes("abc123"), "so does the HTML");
ok(
  mail.text.includes("20 Minuten"),
  "and both say how long it lasts, so nobody sits on a dead link",
);
ok(mail.html.includes("20 Minuten"), "in the HTML too");

section("the HTML escapes, even though every value here is ours");
ok(
  mail.html.includes("&amp;x=1"),
  "an ampersand in the URL is an entity, not a broken attribute",
);
const nasty = signInEmail(
  "x@y.z",
  'https://e.com/?t="><script>alert(1)</script>',
  20,
);
ok(
  !nasty.html.includes("<script>"),
  "a quote-and-tag payload cannot break out of the href",
);

section("nothing in the message phones home");
ok(!/<img/i.test(mail.html), "no image, so no tracking pixel");
ok(
  !/http:\/\//.test(mail.html.replace(URL, "")),
  "no plain-http asset to be stripped or snooped",
);
eq(
  (mail.html.match(/https?:\/\//g) ?? []).length,
  2,
  "exactly two URLs, both the sign-in link — the button and the copyable one",
);

section("Gmail and Microsoft rewrite a From they did not authenticate");
/*
 * Neither rejects a mismatched From — they replace it with the account you logged in as. No error
 * anywhere, so the only place this can be caught is before it is sent.
 */
clear();
const rewrite = (host: string, user: string, fromAddr: string) => {
  process.env.SMTP_HOST = host;
  process.env.SMTP_USER = user;
  process.env.DEUTSCHMATE_MAIL_FROM = fromAddr;
  return fromWillBeRewritten();
};

eq(
  rewrite("smtp.gmail.com", "me@gmail.com", "DeutschMate <me@gmail.com>"),
  null,
  "silent when the From is the authenticated account",
);
ok(
  rewrite(
    "smtp.gmail.com",
    "me@gmail.com",
    "DeutschMate <no-reply@firmway.eu>",
  ) !== null,
  "warns when it is a different address",
);
eq(
  rewrite("SMTP.GMAIL.COM", "  Me@Gmail.com ", "me@gmail.com"),
  null,
  "case and stray spaces are not a mismatch — that would be a warning nobody could act on",
);
ok(
  rewrite("smtp.office365.com", "me@firm.com", "other@firm.com") !== null,
  "Microsoft 365 too",
);
eq(
  rewrite("smtp.fastmail.com", "me@fastmail.com", "no-reply@mydomain.de"),
  null,
  "a provider that honours the From is left alone — sending as your own domain is the normal case",
);
process.env.SMTP_HOST = "smtp.gmail.com";
delete process.env.SMTP_USER;
eq(
  fromWillBeRewritten(),
  null,
  "and an unauthenticated relay has nothing to rewrite to",
);
clear();

section("the test message says which transport it proves, and nothing else");
const t = testEmail("me@example.com", "smtp");
ok(t.text.includes("smtp"), "names the transport");
ok(!t.text.includes("token"), "and carries no credential of any kind");

done();
