import Page from "@/components/Page";
import TextTool from "./TextTool";

export const dynamic = "force-dynamic";

/**
 * Dein Text — the app pointed at real German. Everything else here teaches from 38 curated
 * readings, which run out and were never about your Tuesday.
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
