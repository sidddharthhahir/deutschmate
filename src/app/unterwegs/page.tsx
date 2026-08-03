import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { all } from "@/lib/db";
import { currentUser } from "@/lib/user";
import WalkMode from "./WalkMode";

export const dynamic = "force-dynamic";

/**
 * Unterwegs — an hour a day is easier to find in twenty-minute pieces.
 *
 * Draws from words already met, oldest-seen first, so the walk covers ground
 * the deck isn't scheduling today. It deliberately does NOT pull due cards:
 * those deserve a real review with a real grade, and hearing them here first
 * would waste the retrieval.
 */
export default async function WalkPage() {
  const user = currentUser("sid");

  const cards = all<{
    cardId: number;
    wordId: string;
    lemma: string;
    article: string | null;
    en: string;
    audio_url: string | null;
  }>(
    `SELECT c.id AS cardId, w.id AS wordId, w.lemma, w.article, w.en, w.audio_url
       FROM card c JOIN word w ON w.id = c.ref_id
      WHERE c.user_id = ? AND c.ref_type = 'word' AND c.reps > 0 AND c.suspended = 0
        AND datetime(c.due) > datetime('now')
      ORDER BY c.last_review ASC
      LIMIT 40`,
    user.id,
  );

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[620px] flex-1 px-6 py-10 md:px-10">
        <Link
          href="/ueben"
          className="font-mono text-muted hover:text-secondary text-[12px] transition-colors"
        >
          ← Üben
        </Link>

        <h1 className="font-serif mt-4 text-[32px] font-semibold tracking-[-0.015em]">
          Unterwegs
        </h1>
        <p className="text-secondary mt-3 max-w-[58ch] text-[15px] leading-relaxed">
          Freihändig hören, während du läufst. Zählt als Kontakt mit den Wörtern, nicht
          als Wiederholung — dein Plan bleibt unberührt.
        </p>

        <div className="mt-8">
          <WalkMode cards={cards} />
        </div>
      </div>
    </main>
  );
}
