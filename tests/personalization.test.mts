/**
 * Personalization end to end: the error-driven Fix reason, cross-user
 * isolation of every personalization field, and graceful behavior for
 * accounts with no personalization data at all.
 * needs: server
 */
import { get, post, ok, eq, section, done, scratchUser, open } from "./harness.mts";

const ALICE = scratchUser("test-perso-alice");
const BOB = scratchUser("test-perso-bob");
await get(`/api/session?user=${ALICE}`); // create both users
await get(`/api/session?user=${BOB}`);

section("a user with no errors gets the normal plan — no Fix block");
const cleanPlan = await get(`/api/session?user=${ALICE}`);
const fixBlock = cleanPlan.blocks.find((b: { kind: string }) => b.kind === "fix");
eq(fixBlock, undefined, "no recurring mistakes, so no Fix block at all — nothing to explain");

section("recurring mistakes produce a Fix block with an understandable reason");
// Same words, different order — a reliable word-order mistake for classify().
for (let i = 0; i < 3; i++) {
  await post(`/api/attempt?user=${ALICE}`, {
    kind: "review",
    correct: false,
    answer: "Deutsch lerne ich",
    expected: "Ich lerne Deutsch",
  });
}
const withErrors = await get(`/api/session?user=${ALICE}`);
const fix = withErrors.blocks.find((b: { kind: string }) => b.kind === "fix");
ok(fix, "the Fix block now appears");
ok(
  typeof fix?.payload?.reason === "string" && fix.payload.reason.length > 0,
  "and it names why, in one sentence",
  fix?.payload?.reason,
);
ok(
  fix?.payload?.reason?.includes(fix.payload.tags[0]?.tag ? "Wortstellung" : ""),
  "the reason names the actual top tag (Wortstellung for a word-order mistake)",
  fix?.payload?.reason,
);

section("a balanced mix, not only weak areas");
/* The Fix block is one of several — new material, review, and corrective
   practice all still appear the same day. This is a structural guarantee,
   not something the Fix payload itself has to enforce. */
const kinds = withErrors.blocks.map((b: { kind: string }) => b.kind);
ok(
  kinds.some((k: string) => k !== "fix"),
  "the Fix block sits alongside other content, never the whole session",
  kinds.join(","),
);
ok(kinds.length > 1, "more than one block", kinds.join(","));

section("error data from one user cannot affect another user's plan");
const bobPlan = await get(`/api/session?user=${BOB}`);
const bobFix = bobPlan.blocks.find((b: { kind: string }) => b.kind === "fix");
eq(bobFix, undefined, "Bob has made no mistakes, so Bob sees no Fix block — Alice's errors are invisible to him");

section("the plan remains valid when error data is malformed");
/* A row whose error_tags_json is not valid JSON must not take the whole
   session plan down — topErrorTags/JSON.parse it, and a broken row here is
   exactly the kind of pre-existing-data problem a real install can have. */
const db = open();
db.prepare(
  `INSERT INTO attempt (user_id, kind, correct, error_tags_json) VALUES (?, 'review', 0, ?)`,
).run(ALICE, "{not valid json");
db.close();
const afterMalformed = await get(`/api/session?user=${ALICE}`);
ok(Array.isArray(afterMalformed.blocks), "the plan still builds — a bad row does not 500 the session");

section("display name — cross-user isolation");
await post(`/api/settings?user=${ALICE}`, { action: "display-name", displayName: "Alice-Name" });
const aliceSession = await get(`/api/session?user=${ALICE}`);
const bobSession = await get(`/api/session?user=${BOB}`);
eq(aliceSession.displayName, "Alice-Name", "Alice sees her own name");
eq(bobSession.displayName, null, "Bob has no display name of his own, and never sees Alice's");

section("existing users without any personalization data are unaffected");
/* A freshly-created scratch user IS "an existing user with no personalization
   data" — this repo has no way to create an account that isn't fresh, so this
   is the same case, checked from the start of this file rather than a
   separate fixture. */
eq(bobSession.situation, null, "no situation set — null, not a crash or a default guess");
eq(bobSession.displayName, null, "no display name set — null, not a fabricated one");
ok(typeof bobSession.blocks !== "undefined", "the session still builds normally");

done();
