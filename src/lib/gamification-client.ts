/**
 * Client-side XP/hearts store, mirroring lib/outbox.ts's onOutboxChange
 * pattern: whoever wants to show the header HUD subscribes instead of
 * polling, and lib/blocks/shared.tsx's record() announces every update it
 * gets back from the server.
 */

export type Stats = { xpTotal: number; hearts: number };

let current: Stats | null = null;

const listeners = new Set<(s: Stats) => void>();

export function onStatsChange(fn: (s: Stats) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The last known value, for a component that mounts after the first update. */
export function lastKnownStats(): Stats | null {
  return current;
}

/** Called from wherever a server response includes a fresh `stats` field. */
export function setStats(s: Stats) {
  current = s;
  listeners.forEach((fn) => fn(s));
}
