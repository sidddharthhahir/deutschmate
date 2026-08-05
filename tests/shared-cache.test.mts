/**
 * What one learner's key pays for, and who gets to read it.
 * needs: seeded database
 */
import { ok, eq, section, done, open } from "./harness.mts";
import {
  contributions,
  explanationKey,
  findExplanation,
  forgetContributions,
  isAppContent,
  saveExplanation,
} from "../src/lib/shared-cache.ts";
/* db.ts directly, not errors.ts: that one imports "./db" without an extension
   because Next resolves it, and Node does not. Same reason the pure modules
   exist. The row below is exactly what storeExplanation writes. */
import { get, tx, run } from "../src/lib/db.ts";

const A = "test-cache-a";
const B = "test-cache-b";

const wipe = () => {
  const d = open();
  for (const u of [A, B]) {
    d.prepare("DELETE FROM explanation WHERE created_by = ?").run(u);
    d.prepare("DELETE FROM error_pattern WHERE created_by = ?").run(u);
  }
  d.close();
};
wipe();
process.on("exit", wipe);

/* A sentence the app really ships, taken from the database rather than typed
   here — a literal would rot the moment the content changes and the test would
   then be asserting nothing. */
const real = get<{ de: string }>(
  "SELECT de FROM sentence WHERE length(de) > 12 LIMIT 1",
)?.de;

section("what counts as the app's own German");
ok(real !== undefined, "the seeded corpus has a sentence to test with");
ok(isAppContent(real!), "a sentence from the course is app content");
ok(
  isAppContent(real!.toUpperCase()),
  "casing does not matter — the same sentence read aloud in caps is the same sentence",
);
ok(
  !isAppContent(
    "Sehr geehrte Frau Ahir, Ihr Antrag vom 3. Juni wurde abgelehnt.",
  ),
  "a letter somebody pasted is not",
);
/* Substring matching makes short strings match by accident, and the accident
   would publish them. "der" is in every text the app ships. */
ok(!isAppContent("der"), "a word is not a sentence, whatever it matches");
ok(!isAppContent("im Haus"), "nor is a phrase");
ok(!isAppContent("Guten Tag"), "nor two words, even real ones");

section("keys keep the two kinds apart");
ok(
  explanationKey("Ich bin müde", "A1.1", null) !==
    explanationKey("Ich bin müde", "A1.1", A),
  "shared and private rows for the same sentence get different keys",
);
ok(
  explanationKey("Ich bin müde", "A1.1", A) !==
    explanationKey("Ich bin müde", "A1.1", B),
  "and two learners' private rows do not collide — otherwise the second pays forever",
);

section("a pasted sentence is stored for its author only");
const PRIVATE = "Mein Vermieter hat die Nebenkosten um 240 Euro erhöht.";
eq(saveExplanation(PRIVATE, "A1.1", A, "…erklärung…"), false, "not shared");
ok(findExplanation(PRIVATE, "A1.1", A) !== null, "the author reads it back");
eq(findExplanation(PRIVATE, "A1.1", B), null, "the other learner does not");

/* The one that matters most: B pays for their own answer to the same sentence
   and must get their own row, not a collision with A's. */
eq(
  saveExplanation(PRIVATE, "A1.1", B, "B's answer"),
  false,
  "B's copy is private too",
);
eq(findExplanation(PRIVATE, "A1.1", B)?.body_md, "B's answer", "B reads B's");
eq(
  findExplanation(PRIVATE, "A1.1", A)?.body_md,
  "…erklärung…",
  "A still reads A's, unchanged",
);

section("a course sentence is shared");
eq(
  saveExplanation(real!, "A1.1", A, "geteilte Erklärung"),
  true,
  "stored as shared",
);
eq(
  findExplanation(real!, "A1.1", B)?.body_md,
  "geteilte Erklärung",
  "the second learner gets it free, which is the point of the cache",
);
eq(findExplanation(real!, "A1.1", B)?.shared, true, "and is told it is shared");

section("the level is part of the key");
eq(
  findExplanation(real!, "B1.2", B),
  null,
  "an A1 explanation is not served to a B1 learner — it is written for a different reader",
);

section("nothing is shared because the caller asked nicely");
/* There is no parameter to pass. */
eq(
  saveExplanation("Bitte teilen Sie das mit allen.", "A1.1", A, "x"),
  false,
  "a sentence that says it wants to be shared still is not",
);

section("counting, without ever reporting the text");
const c = contributions(A);
eq(c.privateRows, 2, "two private explanations");
eq(c.sharedRows, 1, "one shared");
eq(
  Object.values(c).every((v) => typeof v === "number"),
  true,
  "counts only — the sentences never leave the database",
);

section("mistake explanations are attributed");
run(
  `INSERT INTO error_pattern (tag, signature, explain_md, source, created_by, hits)
   VALUES ('verb-ending', ?, 'weil', 'generated', ?, 1)`,
  `test|cache|${A}`,
  A,
);
eq(contributions(A).patterns, 1, "counted against whoever's key paid");

section("taking it back");
eq(forgetContributions(A, "private"), 2, "the private ones go");
eq(findExplanation(PRIVATE, "A1.1", A), null, "and are gone");
eq(
  findExplanation(real!, "A1.1", B)?.body_md,
  "geteilte Erklärung",
  "the shared one stays — deleting your own text is not withdrawing a gift",
);
eq(
  findExplanation(PRIVATE, "A1.1", B)?.body_md,
  "B's answer",
  "B's row is untouched",
);

const removed = forgetContributions(A, "all");
eq(removed, 2, "the shared explanation and the mistake pattern");
eq(
  findExplanation(real!, "A1.1", B),
  null,
  "withdrawn from everybody, as asked",
);

section("prebuilt rows are never anybody's to delete");
const prebuilt =
  get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM error_pattern WHERE source = 'prebuilt'",
  )?.n ?? 0;
ok(prebuilt > 100, "the app ships a few hundred");
forgetContributions(A, "all");
eq(
  get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM error_pattern WHERE source = 'prebuilt'",
  )?.n,
  prebuilt,
  "still there — the offline explanation tier depends on them",
);

section("tx() nests instead of throwing");
/* buildSession → mineFromErrors → addCloze is three levels of function that
   each want a transaction. Before this, the inner BEGIN threw. */
let inner = 0;
tx(() => {
  tx(() => {
    tx(() => {
      inner++;
    });
  });
});
eq(inner, 1, "three deep, ran once, no error");

section("a failing tx() rolls back and reports the real error");
let message = "";
try {
  tx(() => {
    run(
      "INSERT INTO explanation (signature, sentence, level, body_md) VALUES (?,?,?,?)",
      "test-cache-rollback",
      "x",
      "A1.1",
      "y",
    );
    throw new Error("the actual problem");
  });
} catch (e) {
  message = (e as Error).message;
}
eq(
  message,
  "the actual problem",
  "not 'cannot rollback - no transaction is active'",
);
eq(
  get("SELECT 1 FROM explanation WHERE signature = 'test-cache-rollback'"),
  undefined,
  "and the write is gone",
);

done();
