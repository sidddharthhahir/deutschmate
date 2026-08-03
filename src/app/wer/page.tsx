import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { activeUser, allUsers, normaliseName, currentUser, USER_COOKIE } from "@/lib/user";

export const dynamic = "force-dynamic";

/**
 * Who is using this install.
 *
 * Two people sharing one laptop each need their own deck. The database was
 * always ready for it — every progress table is keyed by user — but the pages
 * hardcoded one name, so the second person silently saw the first person's
 * numbers.
 *
 * A cookie, not auth. Anyone with the laptop can switch to anyone; that is the
 * correct threat model for two flatmates and a shared kitchen table.
 */
export default async function WhoPage() {
  const me = await activeUser();
  const users = allUsers();

  async function switchTo(formData: FormData) {
    "use server";
    const raw = String(formData.get("name") ?? "");
    const name = normaliseName(raw);
    // Create the row now, so the switcher lists them next time even before
    // they have done anything.
    currentUser(name);
    const jar = await cookies();
    jar.set(USER_COOKIE, name, {
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365 * 5,
      path: "/",
    });
    redirect("/");
  }

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[560px] flex-1 px-6 py-10 md:px-10">
        <Link
          href="/"
          className="font-mono text-muted hover:text-secondary text-[12px] transition-colors"
        >
          ← Startseite
        </Link>

        <h1 className="font-serif mt-4 text-[32px] font-semibold tracking-[-0.015em]">
          Wer lernt hier?
        </h1>
        <p className="text-secondary mt-3 text-[15px] leading-relaxed">
          Who is learning? Each name has its own deck, its own streak and its own
          progress. The course content is shared.
        </p>

        {users.length > 0 && (
          <div className="mt-8 space-y-2">
            {users.map((u) => (
              <form key={u.id} action={switchTo}>
                <input type="hidden" name="name" value={u.id} />
                <button
                  type="submit"
                  disabled={u.id === me.id}
                  className={`flex w-full items-baseline justify-between rounded-xl border px-5 py-4 text-left transition-colors ${
                    u.id === me.id
                      ? "border-fg bg-raised"
                      : "border-line hover:border-line-strong hover:bg-raised"
                  }`}
                >
                  <span className="font-serif text-[19px]">{u.name}</span>
                  <span className="font-mono text-muted text-[11.5px]">
                    {u.id === me.id ? "das bist du · that's you" : u.level}
                  </span>
                </button>
              </form>
            ))}
          </div>
        )}

        <form action={switchTo} className="border-line-sub mt-8 border-t pt-6">
          <label
            htmlFor="newname"
            className="font-mono text-muted mb-2 block text-[11.5px] tracking-[0.14em] uppercase"
          >
            Neu · someone else
          </label>
          <div className="flex gap-2">
            <input
              id="newname"
              name="name"
              required
              maxLength={32}
              placeholder="Name"
              autoComplete="off"
              className="border-line bg-bg text-fg focus:border-line-strong placeholder:text-muted font-serif flex-1 rounded-xl border px-4 py-3 text-[17px] outline-none"
            />
            <button
              type="submit"
              className="bg-fg rounded-xl px-6 font-medium text-[#16211E] transition-colors hover:bg-white"
            >
              Start
            </button>
          </div>
          <p className="text-muted mt-3 text-[12.5px] leading-relaxed">
            Letters, numbers, hyphens. A new name starts with an empty deck — nothing is
            shared between learners except the course itself.
          </p>
        </form>

        <p className="text-muted/70 mt-10 text-[12px] leading-relaxed">
          This is a cookie on this browser, not a login. Anyone using this computer can
          switch to any name — which is the right level of security for two flatmates and
          one laptop, and none at all for anything else.
        </p>
      </div>
    </main>
  );
}
