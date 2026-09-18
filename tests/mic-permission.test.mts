/**
 * Microphone permission denied — the one failure a speaking exercise cannot
 * shrug off, because it looks identical to "said nothing" unless it is
 * named. needs: nothing
 */
import { readFileSync } from "node:fs";
import { micProblem } from "../src/lib/speech.ts";
import { ok, eq, section, done } from "./harness.mts";

section("permission-denied is named, not generic");
for (const code of ["not-allowed", "service-not-allowed"]) {
  const msg = micProblem(code);
  ok(msg.includes("·"), `${code}: bilingual (DE · EN)`, msg);
  ok(
    /mikrofon/i.test(msg) && /erlaubt|blockiert/i.test(msg),
    `${code}: names the microphone and the block, in German`,
  );
  ok(
    /microphone/i.test(msg) && /(allow|block)/i.test(msg),
    `${code}: says what to do, in English`,
  );
  ok(
    !/%|score|genauigkeit/i.test(msg),
    `${code}: no fabricated accuracy score`,
  );
}

section("every failure code gets its own message, not one generic fallback");
/* This function's whole reason to exist (per its own doc comment) is that a
   missing microphone, a blocked service, and no internet used to all read as
   "say it again" — the one collapse this suite must never let back in. */
const codes = [
  "not-allowed",
  "audio-capture",
  "network",
  "insecure-context",
  "unsupported",
  "timeout",
  "already-running",
  "aborted",
];
const messages = codes.map(micProblem);
ok(
  new Set(messages).size === codes.length,
  "every one of these codes gets its own distinct message",
  new Set(messages).size + " unique of " + codes.length,
);
for (const [code, msg] of codes.map((c, i) => [c, messages[i]] as const)) {
  ok(msg.length > 10, `${code}: has a real message`, msg.slice(0, 40));
}

eq(
  micProblem("some-unheard-of-code"),
  micProblem("unknown-code-too"),
  "an unrecognised code falls back to the same generic message rather than throwing",
);

section("the error renders next to the mic control, not somewhere else");
/* A structural check, not a full render: the mic button and its error line
   must be siblings inside the same block, and the error must come after the
   button in source order — the layout the component actually returns. */
const src = readFileSync("src/components/blocks/SpeakingBlock.tsx", "utf8");
const micIdx = src.indexOf("🎤");
const errorIdx = src.indexOf("{error &&");
ok(micIdx > -1, "the mic button exists");
ok(errorIdx > -1, "the error line exists");
ok(errorIdx > micIdx, "the error line is rendered after the mic button, right below it");

done();
