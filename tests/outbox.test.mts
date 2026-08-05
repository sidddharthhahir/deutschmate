/**
 * The offline queue, driven directly. This is the code that decides whether an answer given on a
 * train is kept or silently thrown away, so it is worth testing rather than assuming.
 * needs: nothing
 */
import { ok, section, done } from "./harness.mts";

// ---- stub the browser -----------------------------------------------------
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => store.set(k, String(v)),
  removeItem: (k: string) => store.delete(k),
};
// Node defines navigator as a getter-only global, so redefine rather than assign.
Object.defineProperty(globalThis, "navigator", {
  value: { onLine: true },
  writable: true,
  configurable: true,
});
(globalThis as any).window = {
  addEventListener() {},
  removeEventListener() {},
};
// The learner is a cookie, and every key is scoped by it.
(globalThis as any).document = { cookie: "" };
const beUser = (name: string) =>
  ((globalThis as any).document.cookie = `dm_user=${name}`);

let mode: "ok" | "throw" | "500" | "400" = "ok";
const seen: { url: string; body: any }[] = [];
const modeFetch = async (url: string, init: any) => {
  seen.push({ url, body: JSON.parse(init.body) });
  if (mode === "throw") throw new Error("network down");
  if (mode === "500") return { status: 500, json: async () => ({}) };
  if (mode === "400")
    return { status: 400, json: async () => ({ error: "nope" }) };
  return { status: 200, json: async () => ({ ok: true }) };
};
(globalThis as any).fetch = modeFetch;

// Imported after the stubs exist, because the module reads them on load.
const ob = await import("../src/lib/outbox.ts");

section("online: straight through");
let res = await ob.send("/api/review", { cardId: 1, grade: 3 });
ok((res as any)?.ok === true, "returns the parsed response");
ok(ob.pendingCount() === 0, "nothing queued", ob.pendingCount());

section("network failure: queued, not lost");
mode = "throw";
res = await ob.send("/api/review", { cardId: 2, grade: 1 });
ok(res === null, "returns null so callers know it did not land");
ok(ob.pendingCount() === 1, "one queued", ob.pendingCount());
await ob.send("/api/attempt", { kind: "builder", correct: false });
ok(ob.pendingCount() === 2, "two queued", ob.pendingCount());

section("the offline flag short-circuits");
(navigator as any).onLine = false;
const before = seen.length;
await ob.send("/api/review", { cardId: 3, grade: 2 });
ok(seen.length === before, "no request attempted while offline");
ok(ob.pendingCount() === 3, "still queued", ob.pendingCount());
(navigator as any).onLine = true;

section("a 4xx is not retried forever");
mode = "400";
await ob.send("/api/review", { cardId: 99, grade: 3 });
ok(
  ob.pendingCount() === 3,
  "a refused request is dropped, not queued",
  ob.pendingCount(),
);

section("a 500 is kept");
mode = "500";
await ob.send("/api/review", { cardId: 4, grade: 3 });
ok(
  ob.pendingCount() === 4,
  "server faults are retried later",
  ob.pendingCount(),
);

section("flush replays in order");
mode = "ok";
const mark = seen.length;
const out = await ob.flush();
ok(out.sent === 4, "all four sent", out.sent);
ok(out.left === 0, "queue drained", out.left);
ok(ob.pendingCount() === 0, "and the count agrees");
const replayed = seen.slice(mark).map((s) => s.body.cardId ?? s.body.kind);
ok(
  JSON.stringify(replayed) === JSON.stringify([2, "builder", 3, 4]),
  "replayed oldest first",
  JSON.stringify(replayed),
);

section("flush stops at the first failure and keeps the rest");
mode = "throw";
for (const cardId of [10, 11, 12])
  await ob.send("/api/review", { cardId, grade: 3 });
ok(ob.pendingCount() === 3, "three queued", ob.pendingCount());

let calls = 0;
(globalThis as any).fetch = async (url: string, init: any) => {
  calls++;
  if (calls === 2) throw new Error("dropped mid-flush");
  seen.push({ url, body: JSON.parse(init.body) });
  return { status: 200, json: async () => ({}) };
};
const partial = await ob.flush();
ok(partial.sent === 1, "sent what it could", partial.sent);
ok(partial.left === 2, "kept the remainder", partial.left);
ok(ob.pendingCount() === 2, "nothing was silently dropped");

section("the plan cache is date-scoped");
ob.cachePlan("full", { blocks: [1, 2, 3] } as any);
ok(ob.cachedPlan("full") !== null, "today's plan is returned");
ok(
  ob.cachedPlan("short") === null,
  "a plan built for a different session shape is not",
);
const raw = JSON.parse(store.get("dm.plan.v1:sid")!);
raw.date = "2020-01-01";
store.set("dm.plan.v1:sid", JSON.stringify(raw));
ok(ob.cachedPlan("full") === null, "yesterday's plan is refused");

/* The bug this whole section exists for: /wer promises "nothing is shared
   between learners", and the queue of ungraded answers was. */
section("switching learner does not hand over the other one's queue");
(globalThis as any).fetch = modeFetch; // the section above swapped it out
store.clear();
beUser("sid");
mode = "throw";
await ob.send("/api/review", { cardId: 501, grade: 1 });
ok(ob.pendingCount() === 1, "sid has one unsent answer", ob.pendingCount());

beUser("mira");
ok(
  ob.pendingCount() === 0,
  "mira's queue is empty, not sid's",
  ob.pendingCount(),
);
await ob.send("/api/review", { cardId: 502, grade: 2 });
ok(ob.pendingCount() === 1, "mira queues her own", ob.pendingCount());

beUser("sid");
ok(
  ob.pendingCount() === 1,
  "and sid's is still exactly his",
  ob.pendingCount(),
);
ok(
  store.has("dm.outbox.v1:sid") && store.has("dm.outbox.v1:mira"),
  "two separate keys",
);

section("the plan and the saved session are scoped the same way");
beUser("sid");
ob.cachePlan("full", { blocks: ["sid"] } as any);
beUser("mira");
ok(ob.cachedPlan("full") === null, "mira does not start sid's cached session");

section("replay is stamped with the learner who answered");
mode = "ok";
beUser("sid");
const pinMark = seen.length;
await ob.flush();
const pinned = seen.slice(pinMark);
ok(
  pinned.length === 1 && pinned[0].body.user === "sid",
  "the queued grade replays as sid regardless of the cookie later",
  JSON.stringify(pinned.map((p) => p.body)),
);
ok(
  ob.pin({ cardId: 1, user: "mira" }, "sid") as any,
  "an explicit user in the body is not overwritten",
);
ok(
  (ob.pin({ cardId: 1, user: "mira" }, "sid") as any).user === "mira",
  "…it stays mira",
);

section("a queue written before the keys were scoped is adopted, not dropped");
store.clear();
beUser("sid");
store.set(
  "dm.outbox.v1",
  JSON.stringify([{ url: "/api/review", body: { cardId: 7 }, at: 1 }]),
);
ok(
  ob.pendingCount() === 1,
  "the legacy queue is still there",
  ob.pendingCount(),
);
ok(
  !store.has("dm.outbox.v1"),
  "and the unscoped key is gone, so it happens once",
);

section("corrupt storage does not throw");
store.set("dm.outbox.v1:sid", "{{{not json");
ok(ob.pendingCount() === 0, "unreadable queue reads as empty");
store.set("dm.plan.v1:sid", "]][[");
ok(ob.cachedPlan("full") === null, "unreadable plan reads as absent");

done();
