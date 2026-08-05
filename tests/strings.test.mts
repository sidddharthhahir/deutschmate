/**
 * Strings that reach the screen unchanged.
 * needs: nothing
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ok, eq, section, done } from "./harness.mts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mts|json)$/.test(p)) out.push(p);
  }
  return out;
}

const ENTITY = /&(?:[a-zA-Z][a-zA-Z0-9]{1,10}|#\d{1,6}|#x[0-9a-fA-F]{1,5});/;
/** Quoted strings, roughly. Enough to separate a literal from JSX text. */
const STRINGS = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

section("the detector can fail");
/* A check that cannot go red is decoration. These are the two shapes, and the
   scan below must tell them apart. */
ok(
  ENTITY.test(
    '{firstRun ? "Let&apos;s go" : "Done"}'.match(STRINGS)!.join(" "),
  ),
  "an entity inside a string literal is caught",
);
ok(
  !("<span>Let&apos;s go</span>".match(STRINGS) ?? []).some((s) =>
    ENTITY.test(s),
  ),
  "…and the same entity as JSX text is not, because React decodes that one",
);

section("no HTML entity survives into a string literal");
const files = [
  ...walk(join(ROOT, "src")),
  ...walk(join(ROOT, "data")),
  ...walk(join(ROOT, "scripts")),
];
const found: string[] = [];
for (const file of files) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      // An escaping table produces entities on purpose, and the news route decodes
      // them. Neither is a string anyone reads. Matched per line, so how prettier
      // happens to break the chain must not change the answer.
      if (/\.replace\(\s*\/[^/]{1,8}\/g?\s*,\s*["'`]&/.test(line)) return;
      if (line.includes(".replace(/&")) return;
      for (const s of line.match(STRINGS) ?? []) {
        if (ENTITY.test(s)) {
          found.push(
            `${relative(ROOT, file).replace(/\\/g, "/")}:${i + 1}  ${s.slice(0, 70)}`,
          );
        }
      }
    });
}
eq(found.length, 0, "none anywhere in src, data or scripts");
if (found.length) for (const f of found) console.log(`        ${f}`);

section("and the file it came from is clean now");
const tour = readFileSync(join(ROOT, "src/app/willkommen/Tour.tsx"), "utf8");
ok(
  tour.includes("Let’s go"),
  "the tour's last button says Let's go with a real apostrophe",
);

section("scanned enough to mean something");
ok(
  files.length > 100,
  "every source and content file was read",
  `${files.length} files`,
);

done();
