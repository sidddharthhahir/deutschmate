import Page from "@/components/Page";
import NewsList from "./NewsList";

export const dynamic = "force-dynamic";

/** Nachrichten — the input that never runs out. */
export default function NewsPage() {
  return (
    <Page
      back="/ueben"
      backLabel="Üben"
      title="Nachrichten"
      lead="Real news, slowly spoken. Not course material — this happened today, and it is new every day."
    >
      <NewsList />
    </Page>
  );
}
