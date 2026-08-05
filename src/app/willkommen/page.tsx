import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import Tour from "./Tour";
import { TAP } from "@/lib/ui";

export const dynamic = "force-dynamic";

/** Willkommen — the page that explains the app. */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ neu?: string }>;
}) {
  const { neu } = await searchParams;
  const firstRun = neu === "1";

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[880px] flex-1 px-6 py-10 md:px-10 md:py-14">
        {!firstRun && (
          <Link
            href="/"
            className={`font-mono text-muted hover:text-secondary mb-6 inline-block text-[12px] transition-colors ${TAP}`}
          >
            ← Home
          </Link>
        )}

        {firstRun && (
          <p className="font-mono text-accent mb-2 text-[11.5px] tracking-[0.14em] uppercase">
            Willkommen · Welcome
          </p>
        )}

        <Tour firstRun={firstRun} />
      </div>
    </main>
  );
}
