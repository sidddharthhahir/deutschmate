/**
 * The situation → recommended-action mapping. Pure, deterministic, and
 * deliberately small — one lookup, no scoring.
 * needs: nothing
 */
import { recommendationFor, KNOWN_SITUATIONS } from "../src/lib/recommendation.ts";
import { ok, eq, section, done } from "./harness.mts";

section("every known situation gets a recommendation, with a real link");
for (const situation of KNOWN_SITUATIONS) {
  const r = recommendationFor(situation);
  ok(Boolean(r.title), `${situation}: has a title`);
  ok(r.href.startsWith("/"), `${situation}: links somewhere real`, r.href);
}

section("the exact mapping the brief specifies");
eq(recommendationFor("just_arrived").href, "/alltag", "just_arrived -> Alltag");
eq(
  recommendationFor("university", { hasUniversityContent: true }).href,
  "/alltag/surv-uni",
  "university, content available -> the specific scenario",
);
eq(
  recommendationFor("university", { hasUniversityContent: false }).href,
  "/alltag",
  "university, content NOT available -> falls back to Alltag generally, not a 404",
);
eq(
  recommendationFor("student_job", { hasJobContent: false }).href,
  "/alltag",
  "student_job with no dedicated content -> the closest real thing, not a fabricated page",
);
eq(recommendationFor(null).href, "/session", "null situation -> the standard default");
eq(
  recommendationFor("not-a-real-situation").href,
  "/session",
  "an unrecognised value is treated the same as null, never thrown",
);

section("pure and deterministic");
const a = recommendationFor("just_arrived");
const b = recommendationFor("just_arrived");
eq(a, b, "same input, same output, every time");

section("never blocks — every recommendation is a suggestion, not a gate");
/* Nothing about this function disables or hides any route; it only chooses
   what to point at. Every situation, including an unrecognised one, still
   resolves to a real href rather than throwing or returning nothing. */
ok(
  KNOWN_SITUATIONS.every((s) => Boolean(recommendationFor(s).href)),
  "every known situation resolves to a real link, none are blocked",
);

done();
