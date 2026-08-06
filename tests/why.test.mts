/**
 * "Warum?" — a wrong answer must always come back with a reason.
 * needs: server, seeded database
 */
import { get, post, ok, section, done, scratchUser, open } from "./harness.mts";

const U = scratchUser("test-why");
await get(`/api/session?user=${U}`); // create the user

section("a wrong typed answer explains itself");
const a = await post("/api/attempt", {
  user: U,
  kind: "listening",
  correct: false,
  answer: "Ich sehe der Mann",
  expected: "Ich sehe den Mann",
  explain: true,
});
ok(a.ok === true, "the attempt is recorded");
ok(
  typeof a.explanation === "string" && a.explanation.length > 0,
  "and comes back with a reason",
  `${a.source}: ${String(a.explanation).slice(0, 60)}`,
);
ok(
  ["cache", "prebuilt", "model", "rule"].includes(a.source),
  "from a known tier",
  a.source,
);
ok(
  Array.isArray(a.tags) && a.tags.length > 0,
  "tagged for the Fix block",
  a.tags?.join(", "),
);

/* der/den is the single most common accusative slip in German, so it is the
   one mistake that must never need a model call. If this stops being answered
   from the prebuilt table, something has broken in the key or the seed —
   `rule` would still pass the check above while costing money forever. */
ok(
  a.source === "prebuilt",
  "and the commonest mistake in the language is free",
  a.source,
);

section("the tier is honest about itself");
/* With no API key the rule tier answers, and it must still say something real.
   The failure this guards against is a blank panel that reads as "no comment"
   when the truth is "we could not reach the model". */
if (a.source === "rule") {
  ok(
    a.explanation.includes("**"),
    "the rule tier names the error type",
    a.explanation,
  );
} else {
  ok(
    true,
    `answered from ${a.source} — the rule tier is the floor, not the norm`,
  );
}

section("a correct answer does not pay for an explanation");
const good = await post("/api/attempt", {
  user: U,
  kind: "listening",
  correct: true,
  answer: "Ich sehe den Mann",
  expected: "Ich sehe den Mann",
  explain: true,
});
ok(
  good.explanation === undefined,
  "nothing is generated when there is nothing to explain",
);

section("grading a card wrong explains it too");
/* The cloze block grades through /api/review rather than /api/attempt. */
const s = await get(`/api/session?user=${U}`);
const nv = s.blocks.find((b: any) => b.kind === "new-vocab");
ok(!!nv, "the new learner is offered vocabulary");
const word = nv.payload.words[0];
await post("/api/attempt", {
  user: U,
  kind: "new-vocab",
  refId: word.id,
  correct: true,
});

const db = open();
const card = db
  .prepare(
    "SELECT id FROM card WHERE user_id = ? AND ref_type = 'word' AND ref_id = ?",
  )
  .get(U, word.id) as { id: number } | undefined;
db.close();
ok(!!card, "introducing it created a card", word.lemma);

const before = countAttempts();
const r = await post("/api/review", {
  user: U,
  cardId: card!.id,
  grade: 1,
  answer: "falsch getippt",
  expected: word.lemma,
  explain: true,
});
ok(r.ok === true, "the grade lands");
ok(
  typeof r.explanation === "string" && r.explanation.length > 0,
  "and carries a reason",
  String(r.explanation).slice(0, 60),
);
ok(
  countAttempts() === before + 1,
  "exactly one attempt row, not two",
  `${before} -> ${countAttempts()}`,
);

section("a right grade asks for nothing");
const r2 = await post("/api/review", {
  user: U,
  cardId: card!.id,
  grade: 4,
  answer: word.lemma,
  expected: word.lemma,
  explain: true,
});
ok(r2.explanation === null, "no explanation on a card you got right");

section("half a sentence is answered as half a sentence, not with grammar");
/*
 * From real use: "Guten Abend" for "Guten Abend, kommen Sie herein." came back
 * with an explanation of present-tense verb endings. True about German, nothing
 * to do with what happened, and a learner cannot tell the difference.
 */
const frag = await post("/api/attempt", {
  user: U,
  kind: "listening",
  correct: false,
  answer: "Guten Abend",
  expected: "Guten Abend, kommen Sie herein.",
  explain: true,
});
const fragText = String(frag.explanation ?? "");
ok(
  /Anfang|fehlt/.test(fragText),
  "it says the rest is missing",
  fragText.slice(0, 70),
);
ok(
  !/-st|-en\b|Endung/i.test(fragText),
  "and does not lecture about verb endings",
);

const whole = await post("/api/attempt", {
  user: U,
  kind: "listening",
  correct: false,
  answer: "Ich sehe der Mann",
  expected: "Ich sehe den Mann",
  explain: true,
});
ok(
  !/erst der Anfang/.test(String(whole.explanation ?? "")),
  "a full attempt with one wrong word is still a real correction",
  String(whole.explanation).slice(0, 50),
);

function countAttempts(): number {
  const db2 = open();
  const n = (
    db2.prepare("SELECT COUNT(*) n FROM attempt WHERE user_id = ?").get(U) as {
      n: number;
    }
  ).n;
  db2.close();
  return n;
}

done();
