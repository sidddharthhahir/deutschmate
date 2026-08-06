import { anyUsers } from "@/lib/user";
import SignInForm from "./SignInForm";

export const dynamic = "force-dynamic";

/** The only door. A username and a password — no address, no link, no inbox. */
export default function SignInPage() {
  const first = !anyUsers();

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px]">
        <p className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase">
          Anmelden · sign in
        </p>

        <SignInForm first={first} />

        <p className="text-muted mt-10 text-[12.5px] leading-relaxed">
          {first
            ? "Das erste Konto auf dieser Installation. Alles bleibt auf diesem Rechner."
            : "DeutschMate speichert deinen Fortschritt auf diesem Server und sonst nirgends. Angemeldet bleibst du auf diesem Gerät."}
        </p>
      </div>
    </main>
  );
}
