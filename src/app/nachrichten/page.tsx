import Page from "@/components/Page";
import NewsList from "./NewsList";

export const dynamic = "force-dynamic";

/**
 * Nachrichten — the input that never runs out.
 *
 * Every other source in the app is finite and was written for a syllabus. This
 * one is today's actual news, spoken slowly by Deutsche Welle for learners,
 * and it will still be new in month six.
 */
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
