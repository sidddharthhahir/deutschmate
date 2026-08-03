"use client";

/**
 * The outbox: writes that survive a dead network.
 *
 * "Offline-first" was principle 2 and it was only half true. Blocks ran offline,
 * but every grade was a fire-and-forget POST — lose the network mid-session and
 * sixty answers vanished silently, which is worse than refusing to start.
 *
 * Anything that CHANGES something goes through here. On failure it is queued in
 * localStorage and replayed when the network returns.
 *
 * ONE HONEST CAVEAT. FSRS schedules from the moment it is told, not from the
 * moment you answered. A card graded on the tram at 09:00 and synced at 18:00
 * is scheduled from 18:00. At daily granularity that is a rounding error, but
 * it is a real difference and worth knowing rather than hiding.
 */

const KEY = "dm.outbox.v1";
const MAX = 500;

export type Pending = { url: string; body: unknown; at: number };

function read(): Pending[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(items: Pending[]) {
  try {
    // Oldest first, capped — a queue that grows without limit eventually
    // fills the storage quota and starts throwing on every write.
    localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX)));
  } catch {
    /* private mode or quota: the session still runs, the write is just lost */
  }
}

export function pendingCount(): number {
  return read().length;
}

/** Anyone who wants to show the badge without polling. */
const listeners = new Set<(n: number) => void>();

export function onOutboxChange(fn: (n: number) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function announce() {
  const n = pendingCount();
  listeners.forEach((fn) => fn(n));
}

function enqueue(url: string, body: unknown) {
  const items = read();
  items.push({ url, body, at: Date.now() });
  write(items);
  announce();
}

/**
 * POST that never loses the write.
 *
 * Returns the parsed response when it went through, or null when it was
 * queued — callers that need the answer (a grade preview, a correction) must
 * handle null rather than assume success.
 */
export async function send<T = unknown>(url: string, body: unknown): Promise<T | null> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueue(url, body);
    return null;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // A 4xx means the server understood and refused; replaying it would just
    // fail again forever. Only transport failures and 5xx are worth keeping.
    if (res.status >= 500) {
      enqueue(url, body);
      return null;
    }
    return (await res.json()) as T;
  } catch {
    enqueue(url, body);
    return null;
  }
}

/** Replay everything queued. Stops at the first failure and keeps the rest. */
export async function flush(): Promise<{ sent: number; left: number }> {
  const items = read();
  if (!items.length) return { sent: 0, left: 0 };

  let sent = 0;
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.body),
      });
      if (res.status >= 500) break;
      sent++;
    } catch {
      break; // still offline — keep the remainder for next time
    }
  }

  const left = items.slice(sent);
  write(left);
  announce();
  return { sent, left: left.length };
}

/**
 * Today's session plan, kept so the session can start without a server.
 *
 * Only today's: the plan is rebuilt daily and yesterday's block list would
 * schedule the wrong work. Stored separately from the outbox because one is a
 * cache and the other is unsent data — conflating them risks dropping writes
 * while clearing a cache.
 */
const PLAN_KEY = "dm.plan.v1";

const today = () => new Date().toISOString().slice(0, 10);

export function cachePlan(shape: string, plan: unknown) {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify({ date: today(), shape, plan }));
  } catch {
    /* best effort */
  }
}

export function cachedPlan<T>(shape: string): T | null {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { date: string; shape: string; plan: T };
    return v.date === today() && v.shape === shape ? v.plan : null;
  } catch {
    return null;
  }
}
