import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import {
  requireUser,
  allUsers,
  createUserByEmail,
  userByEmail,
} from "@/lib/user";
import {
  SESSION_COOKIE,
  UID_COOKIE,
  createSignInToken,
  deliver,
  destroySession,
  normaliseEmail,
  TOKEN_TTL_MIN,
} from "@/lib/auth";
import { transport } from "@/lib/mail";
import { baseUrl } from "@/lib/env";
import { TAP } from "@/lib/ui";

export const dynamic = "force-dynamic";

/** Who is using this install. */
export default async function WhoPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;
  const me = await requireUser();
  const users = allUsers();
  const postal = transport();

  /** Invite somebody, or send yourself a link for another device. */
  async function sendLink(formData: FormData) {
    "use server";
    const email = normaliseEmail(String(formData.get("email") ?? ""));
    if (!email) redirect("/wer?error=1");

    /* An address with no account gets one. This is the invite path and it sits
       behind a signed-in session, so it is not open sign-up. */
    const user = userByEmail(email) ?? createUserByEmail(email);
    if (user) {
      // baseUrl() — one answer for where links point, the one config reports.
      const t = createSignInToken(user.id, baseUrl());
      /* Awaited. redirect() throws to unwind the action, so a floating send
         would be racing a thrown control-flow exception — fine when deliver()
         only wrote to the console, a dropped email now. */
      await deliver(email, t.url, t.expiresAt);
    }
    redirect("/wer?sent=1");
  }

  async function signOut() {
    "use server";
    const jar = await cookies();
    destroySession(jar.get(SESSION_COOKIE)?.value);
    jar.delete(SESSION_COOKIE);
    jar.delete(UID_COOKIE);
    redirect("/anmelden");
  }

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[560px] flex-1 px-6 py-10 md:px-10">
        <Link
          href="/"
          className={`font-mono text-muted hover:text-secondary text-[12px] transition-colors ${TAP}`}
        >
          ← Startseite
        </Link>

        <h1 className="font-serif mt-4 text-[32px] font-semibold tracking-[-0.015em]">
          Wer lernt hier?
        </h1>
        <p className="text-secondary mt-3 text-[15px] leading-relaxed">
          Who is learning? Each account has its own deck, streak and progress.
          The course content is shared.
        </p>

        <div className="border-line bg-raised mt-8 rounded-xl border p-5">
          <p className="font-mono text-muted text-[11px] tracking-[0.14em] uppercase">
            Angemeldet als
          </p>
          <p className="font-serif mt-1.5 text-[21px]">{me.name}</p>
          {me.email && (
            <p className="text-muted font-mono mt-0.5 text-[12px]">
              {me.email}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* Settings live here rather than in the nav: the header is held at
                four items on purpose, and a fifth starts turning Home into a
                menu. This is the page about your account, so it belongs. */}
            <Link
              href="/einstellungen"
              className="border-line text-secondary hover:border-line-strong hover:text-fg rounded-full border px-4 py-1.5 text-[13px] transition-colors"
            >
              Einstellungen
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="border-line text-secondary hover:border-line-strong hover:text-fg rounded-full border px-4 py-1.5 text-[13px] transition-colors"
              >
                Abmelden
              </button>
            </form>
          </div>
        </div>

        {users.length > 1 && (
          <div className="mt-8">
            <p className="font-mono text-muted mb-3 text-[11px] tracking-[0.14em] uppercase">
              Andere Decks hier · {users.length - 1}
            </p>
            <div className="space-y-2">
              {users
                .filter((u) => u.id !== me.id)
                .map((u) => (
                  <div
                    key={u.id}
                    className="border-line-sub flex items-baseline justify-between rounded-xl border px-5 py-3.5"
                  >
                    <span className="font-serif text-[17px]">{u.name}</span>
                    <span className="font-mono text-muted text-[11.5px]">
                      {u.level}
                    </span>
                  </div>
                ))}
            </div>
            <p className="text-muted mt-3 text-[12.5px] leading-relaxed">
              You cannot switch into one of these. Signing in as somebody means
              having their email — send a link below and it goes to them, not to
              you.
            </p>
          </div>
        )}

        <form action={sendLink} className="border-line-sub mt-8 border-t pt-6">
          <label
            htmlFor="email"
            className="font-mono text-muted mb-2 block text-[11.5px] tracking-[0.14em] uppercase"
          >
            Einladen · or sign in on another device
          </label>
          <div className="flex gap-2">
            <input
              id="email"
              name="email"
              type="email"
              required
              maxLength={254}
              placeholder="name@beispiel.de"
              autoComplete="off"
              className="border-line bg-bg text-fg focus:border-line-strong placeholder:text-muted font-serif flex-1 rounded-xl border px-4 py-3 text-[17px] outline-none"
            />
            <button
              type="submit"
              className="bg-fg rounded-xl px-6 font-medium text-[#16211E] transition-colors hover:bg-white"
            >
              Link
            </button>
          </div>
          {sent && (
            <p className="text-accent mt-3 text-[13px]">
              Link erstellt — er steht im Terminal.
            </p>
          )}
          {error && (
            <p className="text-das mt-3 text-[13px]">
              Das sieht nicht nach einer Adresse aus.
            </p>
          )}
          <p className="text-muted mt-3 text-[12.5px] leading-relaxed">
            An address with no account gets one, with an empty deck. The link
            works once and expires in {TOKEN_TTL_MIN} minutes.
          </p>
        </form>

        {/* Where the link goes, read from the server rather than asserted.
            This said flatly that email was not configured — true when there was
            no way to configure it, and a lie the day there was. */}
        {postal === "console" ? (
          <p className="text-muted/70 mt-10 text-[12px] leading-relaxed">
            No mail provider is configured on this install, on purpose — so it
            still runs with no network and no account anywhere. The link is
            printed in the terminal running{" "}
            <code className="bg-raised text-der rounded px-1 py-0.5 font-mono text-[11.5px]">
              npm run dev
            </code>
            ; paste it to whoever it is for.
          </p>
        ) : (
          <p className="text-muted/70 mt-10 text-[12px] leading-relaxed">
            The link is emailed. If it does not arrive within a minute or two,
            the spam folder is the first place to look.
          </p>
        )}
      </div>
    </main>
  );
}
