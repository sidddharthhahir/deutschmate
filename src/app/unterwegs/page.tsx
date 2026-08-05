import Page from "@/components/Page";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/user";
import WalkMode from "./WalkMode";

export const dynamic = "force-dynamic";

/** Unterwegs — an hour a day is easier to find in twenty-minute pieces. */
export default async function WalkPage() {
  const user = await requireUser();

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
    <Page
      back="/ueben"
      backLabel="Üben"
      title="Unterwegs"
      lead="Hands-free listening while you walk. It counts as contact with the words, not as review — your schedule is left untouched."
    >
      <WalkMode cards={cards} />
    </Page>
  );
}
