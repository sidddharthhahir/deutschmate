import Page from "@/components/Page";
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
    <Page
      back="/ueben"
      backLabel="Üben"
      title="Dein Text"
      lead="Paste any German text. The app tells you how much of it you already know, which words it can teach you next, and turns the sentences into cards."
    >
      <TextTool />
    </Page>
  );
}
