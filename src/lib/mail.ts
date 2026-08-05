import nodemailer from "nodemailer";

/**
 * Sending email, behind one function.
 *
 * `lib/auth.ts` has always had a `deliver()` seam and this is what drops into
 * it. Nothing above it knows a provider exists.
 *
 * THREE TRANSPORTS, CHOSEN BY CONFIG, DEFAULTING TO THE ONE THAT NEEDS NOTHING
 *
 *   console   the server terminal. The default, and still the right answer for
 *             one person on a laptop: no account, no domain, no network. The
 *             repo's "clone and run" promise (spec §17) depends on this staying
 *             the default rather than becoming a setup step.
 *   smtp      any provider, including a company mailbox. Almost certainly what
 *             a @firmway.eu address wants.
 *   resend    an HTTP API, for when you have no SMTP credentials to hand.
 *
 * WHY NODEMAILER AND NOT A HAND-ROLLED SMTP CLIENT
 *
 * Node has no SMTP client, and the temptation was to write one over node:net —
 * it is only a few commands. The parts that go wrong are the parts that fail
 * *silently*: STARTTLS upgrade, AUTH mechanism negotiation, RFC 2047 encoding
 * of a subject with an umlaut in it, dot-stuffing a body line that begins with
 * a period, CRLF discipline. Every one produces mail that either vanishes or
 * arrives mangled, and the app would report success. That is the exact failure
 * shape this codebase keeps deleting, so: one dependency.
 *
 * Resend needs no dependency at all — it is one fetch — so it does not get one.
 */

export type MailTransport = "console" | "smtp" | "resend";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type SendResult = { ok: boolean; via: MailTransport; error?: string };

const str = (name: string): string => (process.env[name] ?? "").trim();

/**
 * Which transport is configured.
 *
 * Explicit `DEUTSCHMATE_MAIL` wins. Otherwise credentials decide, so that
 * filling in SMTP_HOST is enough and there is no second switch to forget —
 * a switch you can set without the credentials, or credentials without the
 * switch, is two ways to have mail silently not send.
 */
export function transport(): MailTransport {
  const explicit = str("DEUTSCHMATE_MAIL").toLowerCase();
  if (explicit === "smtp" || explicit === "resend" || explicit === "console") return explicit;
  if (str("SMTP_HOST")) return "smtp";
  if (str("RESEND_API_KEY")) return "resend";
  return "console";
}

/** The From address. Without one, no provider will accept the message. */
export function from(): string {
  return str("DEUTSCHMATE_MAIL_FROM") || "DeutschMate <no-reply@localhost>";
}

/** Just the address out of `Name <a@b.c>`, lowercased. */
export function fromAddress(): string {
  const f = from();
  return (f.match(/<([^>]+)>/)?.[1] ?? f).trim().toLowerCase();
}

/**
 * Providers that silently rewrite a From they did not authenticate.
 *
 * Gmail and Microsoft 365 do not reject a mismatched From — they replace it
 * with the account you logged in as. So the mail arrives, the app reports
 * success, and the address the learner sees is not the one configured. Nothing
 * anywhere says why. Worth one check, because the fix is one line and the
 * symptom is "my colleague got an email from a stranger".
 */
export function fromWillBeRewritten(): string | null {
  const host = str("SMTP_HOST").toLowerCase();
  const user = str("SMTP_USER").trim().toLowerCase();
  if (!user || !/gmail|googlemail|office365|outlook/.test(host)) return null;
  const addr = fromAddress();
  if (addr === user) return null;
  return `${host.includes("gmail") ? "Gmail" : "Microsoft"} sends as the account you authenticate as. DEUTSCHMATE_MAIL_FROM is ${addr} but SMTP_USER is ${user}, so the From will be rewritten to ${user}`;
}

/**
 * Is the chosen transport actually usable? No network call — this only checks
 * that the settings it needs are present, so it is safe to call per request.
 */
export function mailReady(): { ok: boolean; why?: string } {
  const t = transport();
  if (t === "console") return { ok: true };
  if (!str("DEUTSCHMATE_MAIL_FROM")) {
    return { ok: false, why: "DEUTSCHMATE_MAIL_FROM is unset — a provider will reject the message" };
  }
  if (t === "smtp") {
    if (!str("SMTP_HOST")) return { ok: false, why: "SMTP_HOST is unset" };
    // User and password are genuinely optional: a local relay or an internal
    // company MTA often takes unauthenticated mail from inside the network.
    if (str("SMTP_USER") && !str("SMTP_PASS")) {
      return { ok: false, why: "SMTP_USER is set but SMTP_PASS is not" };
    }
    return { ok: true };
  }
  if (!str("RESEND_API_KEY")) return { ok: false, why: "RESEND_API_KEY is unset" };
  return { ok: true };
}

/**
 * Port and TLS, which is where SMTP setups usually go wrong.
 *
 * 465 is implicit TLS — the socket is encrypted from the first byte. 587 is
 * STARTTLS: it opens in the clear and upgrades, which nodemailer does when
 * `secure` is false. Getting these the wrong way round produces a hang rather
 * than an error, so the port decides unless SMTP_SECURE says otherwise.
 */
function smtpOptions() {
  const port = Number(str("SMTP_PORT")) || 587;
  const explicitSecure = str("SMTP_SECURE").toLowerCase();
  const secure =
    explicitSecure === "true" || explicitSecure === "1"
      ? true
      : explicitSecure === "false" || explicitSecure === "0"
        ? false
        : port === 465;
  const user = str("SMTP_USER");
  const pass = str("SMTP_PASS");
  return {
    host: str("SMTP_HOST"),
    port,
    secure,
    ...(user ? { auth: { user, pass } } : {}),
    // A dead host should fail in seconds. The caller is a person waiting on a
    // sign-in form, and nodemailer's default would leave them on a spinner.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

async function sendSmtp(mail: Mail): Promise<SendResult> {
  try {
    await nodemailer.createTransport(smtpOptions()).sendMail({
      from: from(),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return { ok: true, via: "smtp" };
  } catch (e) {
    return { ok: false, via: "smtp", error: e instanceof Error ? e.message : "SMTP failed" };
  }
}

async function sendResend(mail: Mail): Promise<SendResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${str("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from(),
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      /* Resend puts the reason in the body, and it is usually the one that
         matters: an unverified sending domain. Worth surfacing verbatim. */
      const body = await res.text().catch(() => "");
      return { ok: false, via: "resend", error: `${res.status} ${body.slice(0, 300)}` };
    }
    return { ok: true, via: "resend" };
  } catch (e) {
    return { ok: false, via: "resend", error: e instanceof Error ? e.message : "request failed" };
  }
}

/**
 * Send, or say why not.
 *
 * Never throws. The caller is a sign-in request whose response must not depend
 * on whether the send worked — see the route for why — so a failure has to come
 * back as a value that can be logged rather than as an exception that changes
 * the response shape.
 */
export async function sendMail(mail: Mail): Promise<SendResult> {
  const t = transport();
  if (t === "console") return { ok: true, via: "console" };
  const ready = mailReady();
  if (!ready.ok) return { ok: false, via: t, error: ready.why };
  return t === "smtp" ? sendSmtp(mail) : sendResend(mail);
}
