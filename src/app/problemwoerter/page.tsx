import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { activeUser } from "@/lib/user";
import { LEECH_THRESHOLD, leeches } from "@/lib/leech";
import LeechList from "./LeechList";

export const dynamic = "force-dynamic";

/**
 * Problemwörter.
 *
 * The page the app owed you. FSRS will schedule a word you have forgotten
 * fifteen times forever, without ever saying that something has gone wrong —
 * and grinding those same words is the specific experience that makes people
 * abandon spaced repetition.
 *
 * Not a new nav target: the header stays at four. This is reached from Üben and
 * from Fortschritt, which are the two places you'd go looking for it.
 */
export default async function LeechPage() {
  const user = await activeUser();
  const rows = leeches(user.id);
  const active = rows.filter((r) => r.suspended === 0).length;

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
          Problemwörter
        </h1>
        <p className="text-secondary mt-3 max-w-[62ch] text-[15px] leading-relaxed">
          {active > 0 ? (
            <>
              {active} {active === 1 ? "word is" : "words are"} fighting you — you have
              forgotten each of them at least {LEECH_THRESHOLD} times. Reviewing them more
              often will not help: that is exactly what you are already doing.
            </>
          ) : (
            <>Words you have forgotten at least {LEECH_THRESHOLD} times.</>
          )}
        </p>

        <div className="mt-8">
          <LeechList initial={rows} threshold={LEECH_THRESHOLD} />
        </div>

        {rows.length > 0 && (
          <div className="border-line-sub text-muted mt-10 space-y-2 border-t pt-6 text-[13px] leading-relaxed">
            <p>
              <span className="text-secondary">Im Satz üben</span> — turns the example
              sentence into a gap-fill. A word with no context is the commonest reason it
              won&apos;t stick.
            </p>
            <p>
              <span className="text-secondary">Neu anfangen</span> — resets the card as if
              you had never seen the word. The forgotten-count deliberately stays: it is the
              word&apos;s history, not its score.
            </p>
            <p>
              <span className="text-secondary">Pausieren</span> — takes it out of rotation.
              Nothing is lost; it simply stops coming back until you bring it in again.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
