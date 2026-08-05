"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConversationBlock from "@/components/blocks/ConversationBlock";

type Scenario = { role: string; goal: string; opener: string };
type DialogueStep = {
  them: string;
  options: { say: string; ok: boolean; why?: string; next: number }[];
};

export default function ScenarioRunner({
  payload,
}: {
  payload: {
    scenario: Scenario;
    dialogue: DialogueStep[] | null;
    unitId: string;
  };
}) {
  const router = useRouter();
  const [round, setRound] = useState(0);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="border-line bg-surface rounded-[14px] border p-8 text-center">
        <p className="font-serif text-[24px]">Gespräch beendet.</p>
        <div className="mt-6 flex gap-2">
          <button
            onClick={() => {
              setRound((r) => r + 1);
              setDone(false);
            }}
            className="bg-fg flex-1 rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
          >
            Nochmal
          </button>
          <button
            onClick={() => router.push("/ueben")}
            className="border-line text-secondary hover:border-line-strong hover:text-fg flex-1 rounded-xl border py-3.5 transition-colors"
          >
            Zurück
          </button>
        </div>
      </div>
    );
  }

  return (
    <ConversationBlock
      key={round}
      payload={payload}
      onDone={() => setDone(true)}
    />
  );
}
