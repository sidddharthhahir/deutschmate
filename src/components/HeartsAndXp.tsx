"use client";

import { useEffect, useRef, useState } from "react";
import { lastKnownStats, onStatsChange, type Stats } from "@/lib/gamification-client";
import { MAX_HEARTS } from "@/lib/config";

/** Subscribes to the store record()/gradeCard's callers update, so it never polls. */
export default function HeartsAndXp() {
  const [stats, setLocalStats] = useState<Stats | null>(lastKnownStats);
  const [justGained, setJustGained] = useState(false);
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = onStatsChange((s) => {
      setLocalStats((prev) => {
        if (prev && s.xpTotal > prev.xpTotal) {
          setJustGained(true);
          if (popTimer.current) clearTimeout(popTimer.current);
          popTimer.current = setTimeout(() => setJustGained(false), 420);
        }
        return s;
      });
    });
    return () => {
      unsub();
      if (popTimer.current) clearTimeout(popTimer.current);
    };
  }, []);

  if (!stats) return null;

  return (
    <div className="font-mono flex items-center gap-3 text-[12.5px]">
      <span
        className={`text-warm-fg flex items-center gap-1 ${justGained ? "dm-pop" : ""}`}
        title={`${stats.xpTotal} XP`}
      >
        <span aria-hidden>★</span>
        {stats.xpTotal}
      </span>
      <span
        className="text-das flex items-center gap-[3px]"
        title={`${stats.hearts} von ${MAX_HEARTS} Herzen`}
      >
        {Array.from({ length: MAX_HEARTS }, (_, n) => (
          <span key={n} aria-hidden className={n >= stats.hearts ? "opacity-25" : ""}>
            ♥
          </span>
        ))}
      </span>
    </div>
  );
}
