/**
 * Deterministic content variation (Task 3/4) — pickVariant and
 * resolveTemplate. Pure: no database, no randomness, no network.
 * needs: nothing
 */
import {
  pickVariant,
  resolveTemplate,
  VARIANT_SETS,
  type VariantCategory,
} from "../src/lib/variation.ts";
import { ok, eq, section, done } from "./harness.mts";

section("same user, same repetition state — always the same variant");
const seedA = { userId: "alice", exerciseId: "a1-1-u01", repetition: 0 };
const first = pickVariant("name", seedA);
for (let i = 0; i < 20; i++) {
  eq(pickVariant("name", seedA), first, `run ${i}: identical seed, identical result`);
}

section("a different repetition state CAN produce a different approved variant");
/* "Can", not "must" — a hash landing on the same index twice is not a bug.
   Asserted over the whole set instead, so this can't flake on one unlucky
   collision. */
const byRepetition = new Set<string | null>();
for (let rep = 0; rep < VARIANT_SETS.name.length * 3; rep++) {
  byRepetition.add(pickVariant("name", { ...seedA, repetition: rep }));
}
ok(
  byRepetition.size > 1,
  "varying only the repetition number changes the picked variant at least once",
  `${byRepetition.size} distinct variants over ${VARIANT_SETS.name.length * 3} repetitions`,
);

section("a different user CAN produce a different approved variant, same repetition");
const byUser = new Set<string | null>();
for (const userId of ["alice", "bob", "carla", "deniz", "elin", "farid"]) {
  byUser.add(pickVariant("name", { userId, exerciseId: "a1-1-u01", repetition: 0 }));
}
ok(byUser.size > 1, "different users are not all pinned to the same variant");

section("every returned variant is one of the approved set — never invented");
const categories = Object.keys(VARIANT_SETS) as VariantCategory[];
for (const category of categories) {
  for (let rep = 0; rep < 10; rep++) {
    const picked = pickVariant(category, { userId: "x", exerciseId: "y", repetition: rep });
    ok(
      picked !== null && (VARIANT_SETS[category] as readonly string[]).includes(picked),
      `${category} rep ${rep}: "${picked}" is in the approved set`,
    );
  }
}

section("an unknown category returns null, not a made-up value");
// @ts-expect-error deliberately an invalid category, to prove it's handled
eq(pickVariant("nationality", seedA), null, "no such category exists, and none is invented");

section("resolveTemplate — the actual substitution");
eq(
  resolveTemplate("Ich heiße {{name}}.", "Ich heiße Sam.", seedA),
  `Ich heiße ${first}.`,
  "the token is replaced with the deterministically-picked variant",
);
eq(
  resolveTemplate("Hallo, wie geht's?", "Hallo, wie geht's?", seedA),
  "Hallo, wie geht's?",
  "text with no token is returned unchanged",
);
eq(
  resolveTemplate("{{name}} kommt aus {{country}}.", "unused", seedA),
  `${pickVariant("name", seedA)} kommt aus ${pickVariant("country", seedA)}.`,
  "multiple tokens in one line all resolve",
);

section("missing or malformed variant data falls back to the original static content");
eq(
  resolveTemplate("Ich wohne in {{planet}}.", "Ich wohne in Berlin.", seedA),
  "Ich wohne in Berlin.",
  "an unrecognised token falls back to the caller's original text, not a raw {{token}}",
);

section("correct-answer logic is untouched — this module only ever changes display text");
/* resolveTemplate never sees or touches an "ok"/"expected" field — it takes
   a string and returns a string. Proven by construction: nothing here
   accepts or returns anything but plain strings. */
ok(typeof resolveTemplate("x", "y", seedA) === "string", "always a plain string, nothing structural");

done();
