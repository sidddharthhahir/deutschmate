"use client";

import { playAudio } from "@/lib/speech";

export default function WordAudio({
  url,
  lemma,
  source,
}: {
  url: string | null;
  lemma: string;
  source: string | null;
}) {
  return (
    <div className="flex-none text-right">
      <button
        onClick={() => playAudio(url, lemma)}
        className="bg-fg flex h-14 w-14 items-center justify-center rounded-full text-[18px] text-[#16211E] transition-colors hover:bg-white"
        aria-label={`${lemma} anhören`}
      >
        ▶
      </button>
      <p className="font-mono text-muted/70 mt-2 text-[10px]">
        {source === "commons" ? "Muttersprachler" : url ? source : "TTS"}
      </p>
    </div>
  );
}
