/**
 * A queued text says why it is queued, and says something true.
 * needs: server, seeded database
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { post, ok, eq, section, done, scratchUser } from "./harness.mts";

/*
 * Writing this file is what turned up the exit bug in harness.mts: two POSTs
 * from one test aborted the process with 0xC0000409 after printing ALL PASS,
 * because done() called process.exit() on top of sockets that were still
 * closing. Every file that passed was one whose last request was a GET. Fixed
 * there, not worked around here.
 */
const U = scratchUser("test-writing-queue");

section("the server says which kind of waiting this is");
/* A scratch learner has no key, so the correction cannot run — but the text is
   kept either way. The reason is the part that used to be missing. */
const noKey = await post("/api/writing", {
  user: U,
  prompt: "Stell dich vor.",
  body: "Ich heiße Nikhil und ich komme aus Indien. Jetzt wohne ich in Berlin.",
});
ok(noKey.queued === true, "the text is queued, not lost");
eq(noKey.reason, "no-key", "and the reason is the missing key");

const offline = await post("/api/writing", {
  user: U,
  prompt: "Stell dich vor.",
  body: "Zweiter Text, geschrieben ohne Netz.",
  queueOnly: true,
});
ok(offline.queued === true, "a text written offline is queued too");
eq(offline.reason, "offline", "and that one really is offline");

section("the block no longer blames the network for everything");
/*
 * The screen said "Du bist offline" whichever it was, so a learner sitting on
 * a working connection with no API key was told their network was down and
 * sent to fix the wrong thing. The text was always safe; the sentence was not
 * true.
 */
const src = readFileSync(
  path.join(process.cwd(), "src/components/blocks/WritingBlock.tsx"),
  "utf8",
);
ok(
  /const WAITING: Record<QueueReason/.test(src),
  "there is a line for each reason",
);
for (const reason of ["offline", "no-key", "budget", "call-failed"])
  ok(src.includes(`"${reason}"`), `  ${reason} is handled`);
ok(
  !/Du bist offline[\s\S]{0,80}sobald du wieder\s*\n?\s*online/.test(
    src.replace(/\s+/g, " "),
  ) || src.includes("no-key"),
  "the offline copy is one branch, not the only one",
);

done();
