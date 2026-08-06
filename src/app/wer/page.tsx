import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { requireUser, allUsers } from "@/lib/user";
import { SESSION_COOKIE, UID_COOKIE, destroySession } from "@/lib/auth";
import { TAP } from "@/lib/ui";

export const dynamic = "force-dynamic";

/** Who is using this install. */
export default async function WhoPage() {
  const me = await requireUser();
  const users = allUsers();

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
              You cannot switch into one of these from here. Signing in as
              somebody means knowing their password — sign out, and they sign in
              as themselves.
            </p>
          </div>
        )}

        <div className="border-line-sub mt-8 border-t pt-6">
          <p className="font-mono text-muted mb-2 text-[11.5px] tracking-[0.14em] uppercase">
            Noch jemand?
          </p>
          <p className="text-secondary text-[14px] leading-relaxed">
            Sign out and pick{" "}
            <strong className="text-fg">Konto erstellen</strong> on the sign-in
            screen. A username, a password, and a recovery code to write down —
            no address, nothing to send, nothing to wait for.
          </p>
          <p className="text-muted mt-3 text-[12.5px] leading-relaxed">
            If somebody forgets both their password and their code, you can
            reset it from the terminal:{" "}
            <code className="bg-raised text-der rounded px-1 py-0.5 font-mono text-[11.5px]">
              npm run passwd &lt;benutzername&gt;
            </code>
          </p>
        </div>
      </div>
    </main>
  );
}
