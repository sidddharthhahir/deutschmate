import Link from "next/link";
import { SESSION_TTL_DAYS, TOKEN_TTL_MIN } from "@/lib/auth";
import { anyUsers } from "@/lib/accounts";
import { transport } from "@/lib/mail";
import SignInForm from "./SignInForm";

export const dynamic = "force-dynamic";

/** Sign in. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; sent?: string; e?: string }>;
}) {
  const { expired, sent, e } = await searchParams;

  /* Redemption happens in /api/auth/callback, not here: a page render cannot
     set a cookie in the App Router. This screen only reports the outcome. */
  if (expired) {
    return (
      <Shell>
        <Expired />
      </Shell>
    );
  }

  const first = !anyUsers();
  const postal = transport();

  return (
    <Shell>
      {sent ? (
        <>
          <h1 className="font-serif text-[30px] font-semibold tracking-[-0.015em]">
            Check your email
          </h1>
          <p className="text-secondary mt-3 text-[15px] leading-relaxed">
            If <span className="text-fg">{e || "that address"}</span> has an
            account, a sign-in link is on its way. It works once and expires in{" "}
            {TOKEN_TTL_MIN} minutes.
          </p>
          {/* Read from the server, not written in. This paragraph used to say
              flatly that email was not configured, which was true when there
              was no way to configure it and became a lie the day there was —
              on a screen whose entire job is telling you where to look. */}
          {postal === "console" ? (
            <p className="text-muted mt-6 text-[13px] leading-relaxed">
              Running this yourself? The link is printed in the terminal where{" "}
              <code className="bg-raised text-der rounded px-1.5 py-0.5 font-mono text-[12px]">
                npm run dev
              </code>{" "}
              is running — no provider is configured on this install, so the app
              still works with no network and no account anywhere.
            </p>
          ) : (
            <p className="text-muted mt-6 text-[13px] leading-relaxed">
              Nothing after a minute or two? Check the spam folder — that is
              where mail from a new sending domain usually lands.
            </p>
          )}
          <Link
            href="/anmelden"
            className="text-accent mt-8 inline-block text-[14px] hover:underline"
          >
            ← Try a different address
          </Link>
        </>
      ) : (
        <>
          <p className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase">
            {first ? "Erste Anmeldung · first run" : "Anmelden · sign in"}
          </p>
          <h1 className="font-serif mt-2 text-[30px] font-semibold tracking-[-0.015em]">
            {first ? "Make the first account" : "Willkommen zurück"}
          </h1>
          <p className="text-secondary mt-3 text-[15px] leading-relaxed">
            {first
              ? "Nobody has signed up on this install yet, so the first address gets an account. After that, accounts are made from the switcher."
              : "Your email, and we send a link. No password to choose, forget, or leak."}
          </p>
          <SignInForm />
        </>
      )}
    </Shell>
  );
}

function Expired() {
  return (
    <>
      <p className="font-mono text-das text-[11.5px] tracking-[0.14em] uppercase">
        Link abgelaufen
      </p>
      <h1 className="font-serif mt-2 text-[30px] font-semibold tracking-[-0.015em]">
        That link no longer works
      </h1>
      <p className="text-secondary mt-3 max-w-[46ch] text-[15px] leading-relaxed">
        Sign-in links work once and expire after {TOKEN_TTL_MIN} minutes. Asking
        for a new one also cancels the old — so if you requested two, only the
        newer works.
      </p>
      <Link
        href="/anmelden"
        className="bg-fg mt-8 inline-block rounded-xl px-6 py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
      >
        Send a new link
      </Link>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-bg flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-[440px] py-16">
        {children}
        <p className="text-muted/70 mt-12 text-[12px] leading-relaxed">
          DeutschMate keeps your progress on this server and nothing else.
          Sessions last {SESSION_TTL_DAYS} days.
        </p>
      </div>
    </main>
  );
}
