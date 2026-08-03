import Link from "next/link";
import AppHeader from "@/components/AppHeader";
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
          Nachrichten
        </h1>
        <p className="text-secondary mt-3 max-w-[62ch] text-[15px] leading-relaxed">
          Real news, slowly spoken. Not course material — this happened today, and it is
          new every day.
        </p>

        <div className="mt-8">
          <NewsList />
        </div>
      </div>
    </main>
  );
}
