import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import TextTool from "./TextTool";

export const dynamic = "force-dynamic";

/**
 * Dein Text — the app pointed at real German.
 *
 * Everything else here teaches from 38 curated readings, which run out and
 * were never about your Tuesday. This takes anything you paste — a WG advert,
 * a letter from the Ausländerbehörde, a university email, a menu — and gives
 * it the same treatment: what you already know, what the course can teach you
 * next, tap for meaning, keep a sentence as a card.
 *
 * No new machinery. The scanner is a join against the word table, and the
 * reading surface is the same component the course's own texts use.
 */
export default function TextPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[760px] flex-1 px-6 py-10 md:px-10">
        <Link
          href="/ueben"
          className="font-mono text-muted hover:text-secondary text-[12px] transition-colors"
        >
          ← Üben
        </Link>

        <h1 className="font-serif mt-4 text-[32px] font-semibold tracking-[-0.015em]">
          Dein Text
        </h1>
        <p className="text-secondary mt-3 max-w-[62ch] text-[15px] leading-relaxed">
          Paste any German text. The app tells you how much of it you already know, which
          words it can teach you next, and turns the sentences into cards.
        </p>

        <div className="mt-8">
          <TextTool />
        </div>
      </div>
    </main>
  );
}
