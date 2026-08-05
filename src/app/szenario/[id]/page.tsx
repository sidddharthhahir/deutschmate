import Link from "next/link";
import { notFound } from "next/navigation";
import { get } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import ScenarioRunner from "./ScenarioRunner";
import { TAP } from "@/lib/ui";

export const dynamic = "force-dynamic";

/** A single roleplay, replayable outside the daily session. */
export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const u = get<{
    id: string;
    ord: number;
    level: string;
    title: string;
    scenario_json: string | null;
    dialogue_json: string | null;
  }>(
    "SELECT id, ord, level, title, scenario_json, dialogue_json FROM unit WHERE id = ?",
    id,
  );
  if (!u?.scenario_json) notFound();

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[760px] flex-1 px-6 py-10 md:px-10">
        <Link
          href="/ueben"
          className={`font-mono text-muted hover:text-secondary text-[12.5px] transition-colors ${TAP}`}
        >
          ← Üben
        </Link>

        <h1 className="font-serif break-de mt-6 mb-8 text-[28px] font-semibold tracking-[-0.015em]">
          {u.title}
          <span className="font-mono text-muted ml-3 text-[12.5px] font-normal">
            {u.level} · Unit {u.ord}
          </span>
        </h1>

        <ScenarioRunner
          payload={{
            scenario: JSON.parse(u.scenario_json),
            dialogue: u.dialogue_json ? JSON.parse(u.dialogue_json) : null,
            unitId: u.id,
          }}
        />
      </div>
    </main>
  );
}
