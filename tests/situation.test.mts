/**
 * The one onboarding question — never a gate, and never required.
 * needs: server
 */
import { get, post, raw, ok, eq, section, done, scratchUser } from "./harness.mts";

const U = scratchUser("test-situation");
await get(`/api/session?user=${U}`); // create the user

section("picking an answer persists it");
const picked = await post(`/api/situation?user=${U}`, {
  situation: "just_arrived",
});
ok(picked.ok, "the request succeeds", JSON.stringify(picked));
eq(picked.situation, "just_arrived", "and echoes what was stored");

const plan = await get(`/api/session?user=${U}`);
eq(plan.situation, "just_arrived", "the session plan reflects it");

section("skipping stores nothing and is not an error");
const skipped = await post(`/api/situation?user=${U}`, {});
ok(skipped.ok, "a missing value is a skip, not a 400", JSON.stringify(skipped));
eq(skipped.situation, null, "nothing is stored");
const afterSkip = await get(`/api/session?user=${U}`);
eq(afterSkip.situation, null, "and the plan agrees");

section("an unrecognised value is treated as a skip, not a crash");
const bogus = await post(`/api/situation?user=${U}`, {
  situation: "definitely-not-a-real-option",
});
ok(bogus.ok, "still succeeds", JSON.stringify(bogus));
eq(bogus.situation, null, "falls back to null rather than storing garbage");

section("signed out cannot set anyone's situation");
const anon = await raw("/api/situation", {
  method: "POST",
  body: JSON.stringify({ situation: "just_arrived" }),
});
eq(anon.status, 401, "no session, no trusted header — refused");

done();
