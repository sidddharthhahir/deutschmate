"use client";

/**
 * The outbox: writes that survive a dead network. "Offline-first" was principle 2 and it was only
 * half true.
 */

/* Explicit ".ts" so tests/outbox.test.mts can load this straight through Node's
   type stripping, which does not do extension resolution. Next resolves it too. */
import { myKey, scoped, whoami } from "./who.ts";
import { OUTBOX_MAX as MAX } from "./config.ts";

const BASE = "dm.outbox.v1";

export type Pending = { url: string; body: unknown; at: number };

/** The queue belongs to a learner, not to a browser. */
const keyFor = (user: string) => scoped(BASE, user);

/** One-time rescue of anything queued before the keys were scoped. */
function adoptLegacy(user: string) {
  try {
    const old = localStorage.getItem(BASE);
    if (!old) return;
    localStorage.removeItem(BASE);
    const items = JSON.parse(old);
    if (!Array.isArray(items) || !items.length) return;
    const mine = readFor(user);
    localStorage.setItem(
      keyFor(user),
      JSON.stringify([...mine, ...items].slice(-MAX)),
    );
  } catch {
    /* a corrupt legacy blob is not worth failing a session over */
  }
}

function readFor(user: string): Pending[] {
  try {
    const raw = localStorage.getItem(keyFor(user));
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function read(): Pending[] {
  const user = whoami();
  adoptLegacy(user);
  return readFor(user);
}

function write(items: Pending[]) {
  try {
    // Oldest first, capped — a queue that grows without limit eventually
    // fills the storage quota and starts throwing on every write.
    localStorage.setItem(keyFor(whoami()), JSON.stringify(items.slice(-MAX)));
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

/** POST that never loses the write. */
export async function send<T = unknown>(
  url: string,
  body: unknown,
): Promise<T | null> {
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

/** Stamp the replay with the learner who owns the queue. */
export function pin(body: unknown, user: string): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const b = body as Record<string, unknown>;
  return b.user ? b : { ...b, user };
}

/** Replay everything queued. Stops at the first failure and keeps the rest. */
export async function flush(): Promise<{ sent: number; left: number }> {
  const owner = whoami();
  const items = read();
  if (!items.length) return { sent: 0, left: 0 };

  let sent = 0;
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pin(item.body, owner)),
      });
      if (res.status >= 500) break;
      sent++;
    } catch {
      break; // still offline — keep the remainder for next time
    }
  }

  /* Re-read rather than writing back the snapshot. */
  const current = read();
  const left = current.slice(sent);
  write(left);
  announce();
  return { sent, left: left.length };
}

/**
 * Today's session plan, kept so the session can start without a server. Only today's: the plan is
 * rebuilt daily and yesterday's block list would schedule the wrong work.
 */
const PLAN_BASE = "dm.plan.v1";

const today = () => new Date().toISOString().slice(0, 10);

export function cachePlan(shape: string, plan: unknown) {
  try {
    localStorage.setItem(
      myKey(PLAN_BASE),
      JSON.stringify({ date: today(), shape, plan }),
    );
  } catch {
    /* best effort */
  }
}

export function cachedPlan<T>(shape: string): T | null {
  try {
    const raw = localStorage.getItem(myKey(PLAN_BASE));
    if (!raw) return null;
    const v = JSON.parse(raw) as { date: string; shape: string; plan: T };
    return v.date === today() && v.shape === shape ? v.plan : null;
  } catch {
    return null;
  }
}
