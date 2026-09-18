/**
 * POST /api/video writes to shared curriculum content and must never be
 * reachable by an unauthenticated request, regardless of DEUTSCHMATE_ADMIN.
 * needs: server
 */
import { readFileSync } from "node:fs";
import { get, raw, ok, section, done } from "./harness.mts";

const src = readFileSync("src/app/api/video/route.ts", "utf8");

section("the route checks who is asking, not just whether admin mode is on");
/*
 * adminEnabled() alone used to be the only gate — a switch anyone reaching
 * the server over the network could ride, whether or not they had ever
 * signed in. This pins both checks existing, and in the right order: the
 * write (the first `run(`) must come after the auth check, not before it.
 */
const postStart = src.indexOf("export async function POST");
const adminCheckIdx = src.indexOf("adminEnabled()", postStart);
const authCheckIdx = src.indexOf("activeUser(req)", postStart);
const firstWriteIdx = src.indexOf("run(\n", postStart);

ok(adminCheckIdx > postStart, "checks adminEnabled()");
ok(authCheckIdx > postStart, "checks activeUser()");
ok(
  authCheckIdx > adminCheckIdx && authCheckIdx < firstWriteIdx,
  "the auth check runs after the admin-mode check and before any database write",
);

section("GET stays public — it only reads shared course content");
const listed = await get("/api/video");
ok(Array.isArray(listed.videos), "the catalogue still loads with no session");

section("POST is refused without a session, admin mode notwithstanding");
/* This test run's server has DEUTSCHMATE_ADMIN unset (the harness's own
   .env.local does not set it), so this exercises the admin-mode-off path —
   the admin-mode-on path is covered by the static check above and was
   verified by hand against a temporary build with DEUTSCHMATE_ADMIN=1 (see
   SECURITY_AUDIT_REPORT.md). Either way the answer must not be 200. */
const res = await raw("/api/video", {
  method: "POST",
  body: JSON.stringify({
    title: "should never be written",
    level: "A1.1",
    youtubeId: "should-not-exist",
  }),
});
ok(res.status !== 200, "refused, one way or another", String(res.status));

const stillClean = await get("/api/video");
ok(
  !stillClean.videos.some((v: { youtube_id: string }) =>
    v.youtube_id?.includes("should-not-exist"),
  ),
  "and nothing was written",
);

done();
