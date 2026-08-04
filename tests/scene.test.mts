/**
 * Which brief the tutor is actually given.
 *
 * This is the bug that hid best in the whole app. All six Alltag scenarios
 * pass an id like "surv-anmeldung" to the conversation route; the route looked
 * it up in the `unit` table, found nothing, and fell back to "a friendly
 * German speaker having a short chat". So the Bürgeramt, the WG viewing and
 * the contract cancellation all ran as a chat with a stranger — while the page
 * beside them displayed the correct brief, word for word.
 *
 * Nothing failed. No error, no empty screen, no missing text. The conversation
 * worked perfectly; it was simply the wrong conversation. That is why it
 * survived a full audit of the page, and why the check below is on the
 * resolution rather than on anything visible.
 *
 * needs: nothing
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveScene, isGeneric, GENERIC } from "../src/lib/scene.ts";
import { ok, eq, section, done } from "./harness.mts";

type Survival = {
  id: string;
  title: string;
  scenario: { role: string; goal: string; opener: string };
  phrases: { de: string; en: string }[];
  hear?: { de: string; en: string }[];
  bring: string[];
};

const survival = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/scenarios-survival.json"), "utf8"),
) as Survival[];

const UNIT_JSON = JSON.stringify({
  role: "a barista",
  goal: "order a coffee",
  opener: "Was darf es sein?",
});

section("a survival scenario reaches the model");
for (const s of survival) {
  const scene = resolveScene(s.scenario, null);
  ok(!isGeneric(scene), `${s.id} resolves to its own brief`, scene.role.slice(0, 46));
  ok(scene.role === s.scenario.role, `  and it is the one the page shows`);
}

section("a course unit still resolves");
const unit = resolveScene(undefined, UNIT_JSON);
eq(unit.role, "a barista", "the unit's scenario_json is used");
eq(unit.opener, "Was darf es sein?", "including its opener");

section("survival wins when both are somehow present");
/* Only reachable through a content mistake — a unit id colliding with a
   survival id — but the survival brief is the hand-written specific one, so it
   is the one to keep. */
const both = resolveScene(survival[0].scenario, UNIT_JSON);
eq(both.role, survival[0].scenario.role, "the survival brief takes precedence");

section("nothing resolvable falls back visibly");
ok(isGeneric(resolveScene(undefined, null)), "no id at all");
ok(isGeneric(resolveScene(undefined, undefined)), "unknown id");
ok(isGeneric(resolveScene({}, null)), "an empty survival object");
ok(isGeneric(resolveScene({ role: "a clerk" }, null)), "a role with no goal");
ok(isGeneric(resolveScene(undefined, "{{{ not json")), "a malformed unit blob");
ok(isGeneric(resolveScene(undefined, '{"role":"x"}')), "a unit blob missing its goal");

section("an opener is optional, a role and goal are not");
const noOpener = resolveScene({ role: "a nurse", goal: "take your details" }, null);
eq(noOpener.role, "a nurse", "the brief is used");
eq(noOpener.opener, GENERIC.opener, "and the opener falls back rather than being empty");

section("the content itself");
/* The premise of the whole fix: these ids are NOT unit ids, which is why a
   single unit lookup could never find them. If that ever stops being true the
   collision needs thinking about, not silently resolving. */
ok(
  survival.every((s) => s.id.startsWith("surv-")),
  "every survival id is namespaced away from unit ids",
  survival.map((s) => s.id).join(" "),
);
ok(survival.length === 6, "six scenarios", survival.length);
for (const s of survival) {
  ok(s.phrases.length >= 5, `${s.id}: enough to say`, `${s.phrases.length} phrases`);
  /* The half that was missing. Rehearsing your own lines does not get you
     through an appointment where you cannot understand the question. */
  ok((s.hear?.length ?? 0) >= 5, `  and enough to hear`, `${s.hear?.length ?? 0} lines`);
  ok(s.bring.length >= 3, `  and knows what to bring`, `${s.bring.length}`);
}

done();
