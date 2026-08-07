/**
 * Every block takes the keyboard, and says which keys.
 * needs: nothing
 *
 * A source check rather than a rendering one: there is no DOM in this suite,
 * and the failure this guards against is structural — a block written without
 * any binding at all. That is exactly how thirteen of fifteen ended up
 * mouse-only under a tour promising "your hand never leaves the number row".
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ok, eq, section, done } from "./harness.mts";

const DIR = path.join(process.cwd(), "src/components/blocks");
const read = (f: string) => readFileSync(path.join(DIR, f), "utf8");

const blocks = readdirSync(DIR)
  .filter((f) => f.endsWith("Block.tsx"))
  .sort();

section("the blocks under test");
/* Fourteen *Block.tsx files; shared.tsx holds the hooks and is checked
   separately below. A floor rather than an equality, so adding a block does
   not turn this red — but the loop below means a new block must still bind
   something. */
ok(blocks.length >= 14, "every block file is being checked", blocks.length);

section("each one binds at least one key");
/* The shared hooks, or a hand-rolled listener for the two that predate them. */
const BINDS =
  /use(ChoiceKeys|AdvanceKey|ReplayKey|KeyPress|SubmitKey)\(|addEventListener\("keydown"|onEnter=/;
for (const f of blocks) {
  ok(BINDS.test(read(f)), `  ${f.replace(".tsx", "")}`);
}

section("the numbered options say which number");
/* An unadvertised shortcut is one nobody uses. Any block rendering <Option>
   must pass n, and any block with its own choice buttons must show the kbd. */
for (const f of blocks) {
  const src = read(f);
  if (!/<Option\b/.test(src)) continue;
  ok(
    /\bn=\{n \+ 1\}/.test(src),
    `  ${f.replace(".tsx", "")} numbers its options`,
  );
}

section("nothing fires while somebody is typing");
/* The one exception is Ctrl/Cmd+Enter in Schreiben, which has to reach into
   the textarea and is unambiguous because of the modifier. */
const shared = read("shared.tsx");
ok(
  shared.includes("shouldIgnoreKey"),
  "the shared listener consults the typing guard",
);
ok(
  /useSubmitKey[\s\S]{0,900}modalIsOpen/.test(shared),
  "and the one hook that bypasses it still yields to a modal",
);

section("Space never scrolls the page out from under a shortcut");
const spaceUsers = blocks.filter((f) => /useAdvanceKey\(/.test(read(f)));
ok(spaceUsers.length > 0, "blocks using the advance key", spaceUsers.length);
ok(
  /if \(e\.key !== "Enter" && !\(space && e\.key === " "\)\) return;[\s\S]{0,120}preventDefault/.test(
    shared,
  ),
  "useAdvanceKey calls preventDefault",
);

section("the help overlay lists what is actually bound");
const help = readFileSync(
  path.join(process.cwd(), "src/components/ShortcutHelp.tsx"),
  "utf8",
);
for (const claim of ["Backspace", "Cmd / Ctrl + Enter", "1 – 9", "E"]) {
  ok(help.includes(`"${claim}"`), `  ? mentions ${claim}`);
}
/* And the reverse: a key in the overlay that no block binds is a promise the
   app does not keep, which is the bug this whole exercise was about. */
const allSrc = blocks.map(read).join("\n");
eq(
  /"Backspace"/.test(allSrc),
  true,
  "Backspace is bound somewhere, not just advertised",
);
ok(/useSubmitKey\(/.test(allSrc), "so is Ctrl/Cmd + Enter");

done();
