import type { Mail } from "./mail.ts";

/**
 * The one email this app sends.
 *
 * Written as a pure function of its inputs and kept out of mail.ts, so the
 * wording can be tested without a transport and read without scrolling past
 * SMTP options.
 *
 * PLAIN TEXT IS NOT A COURTESY COPY. Some clients render it instead of the
 * HTML, and a link that only exists in the HTML part is a sign-in that works
 * for most people and mysteriously does not for one. Both parts carry the URL
 * as visible text, so it survives being copied, forwarded, or read aloud.
 *
 * DELIBERATELY PLAIN HTML. Tables-and-inline-styles is how marketing email is
 * built, and it is also how phishing is built. This is one sentence, one link
 * and one line of small print, with inline styles because <style> blocks are
 * stripped by several clients — but no images, no tracking pixel, no
 * link-wrapping redirect. Nothing here reports back that you opened it.
 */
export function signInEmail(to: string, url: string, minutes: number): Mail {
  const subject = "Dein DeutschMate-Link";

  const text = [
    "Hallo,",
    "",
    "hier ist dein Link zum Anmelden bei DeutschMate:",
    "",
    url,
    "",
    `Er funktioniert einmal und läuft in ${minutes} Minuten ab.`,
    "",
    "Wenn du das nicht warst, kannst du diese E-Mail ignorieren — ohne den Link",
    "passiert nichts.",
    "",
    "— DeutschMate",
  ].join("\n");

  /* Escaped even though every value is either app-generated or an address the
     app normalised. It costs nothing and it means adding a field later cannot
     quietly turn this into an injection. */
  const safeUrl = esc(url);

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1a1a1a;max-width:520px">
  <p style="margin:0 0 16px">Hallo,</p>
  <p style="margin:0 0 24px">hier ist dein Link zum Anmelden bei DeutschMate:</p>
  <p style="margin:0 0 24px">
    <a href="${safeUrl}" style="display:inline-block;background:#16211E;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500">Anmelden</a>
  </p>
  <p style="margin:0 0 24px;font-size:13px;color:#666">
    Oder kopier diese Adresse:<br>
    <span style="word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px">${safeUrl}</span>
  </p>
  <p style="margin:0 0 24px;font-size:13px;color:#666">
    Der Link funktioniert einmal und läuft in ${minutes} Minuten ab.
  </p>
  <p style="margin:0;font-size:13px;color:#666">
    Wenn du das nicht warst, kannst du diese E-Mail ignorieren — ohne den Link passiert nichts.
  </p>
</div>`.trim();

  return { to, subject, text, html };
}

/** A message that proves the transport works, and says nothing else. */
export function testEmail(to: string, via: string): Mail {
  const line = `DeutschMate can send email. Transport: ${via}.`;
  return {
    to,
    subject: "DeutschMate — mail test",
    text: `${line}\n\nNothing else to see. If this arrived, sign-in links will too.\n`,
    html: `<p style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">${esc(line)}<br><span style="color:#666;font-size:13px">If this arrived, sign-in links will too.</span></p>`,
  };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
