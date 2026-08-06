/**
 * Files in data/ that nothing reads, and npm scripts nothing mentions.
 *
 * data/units-a1-2.json was written by build-a1 on every run and named in no
 * seeder input, so A1.2 was served from an older generated file with the wrong
 * titles and no grammar. Nothing caught it, because a file that is merely
 * unread looks exactly like a file that is fine.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = ["src", "scripts", "tests"];

/** Every line of code that could name a file. */
const code: string[] = [];
function collect(dir: string) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      collect(full);
      continue;
    }
    if (!/\.(ts|tsx|mts|json|md|sql)$/.test(e.name)) continue;
    if (full.includes(`${path.sep}data${path.sep}`)) continue; // data is the subject
    code.push(readFileSync(full, "utf8"));
  }
}
for (const d of SRC) collect(path.join(ROOT, d));
code.push(readFileSync(path.join(ROOT, "package.json"), "utf8"));
code.push(readFileSync(path.join(ROOT, "README.md"), "utf8"));
const haystack = code.join("\n");

/*
 * Two kinds of file are named nowhere on purpose and are not orphans:
 * `failed-*.txt` is written BY import-words as a diagnostic, and `wordlist-*.txt`
 * is handed to it on the command line. Listing them every run would train
 * whoever reads this to skip the output, which is how the real one hides.
 */
const NOT_ORPHANS = /^(failed-|wordlist-)/;

console.log("\n  data/ files nothing reads\n");
let orphans = 0;
for (const f of readdirSync(path.join(ROOT, "data")).sort()) {
  const full = path.join(ROOT, "data", f);
  if (statSync(full).isDirectory() || NOT_ORPHANS.test(f)) continue;
  /* By bare name and by stem — build-a1 composes `data/words-${slug}.json`,
     so a literal search for the whole path would miss it. */
  const stem = f.replace(/\.json$/, "");
  const named = haystack.includes(f) || haystack.includes(stem);
  const kb = Math.round(statSync(full).size / 1024);
  if (!named) {
    orphans++;
    console.log(`  ORPHAN  ${String(kb).padStart(6)} kB  data/${f}`);
  }
}
if (!orphans) console.log("  none — every data file is named somewhere");

console.log("\n  npm scripts\n");
const pkg = JSON.parse(
  readFileSync(path.join(ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };
const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
for (const [name, cmd] of Object.entries(pkg.scripts)) {
  /* A script pointing at a file that is not there fails only when somebody
     runs it, which for a maintenance script can be months. */
  const file = cmd.match(/(scripts\/[\w.-]+\.mts)/)?.[1];
  const gone = file && !haystack.includes(path.basename(file));
  const documented = readme.includes(`npm run ${name}`) || name === "dev";
  const flags = [gone ? "MISSING FILE" : "", documented ? "" : "not in README"]
    .filter(Boolean)
    .join(", ");
  console.log(`  ${flags ? "!! " : "ok "} ${name.padEnd(18)} ${flags}`);
}
console.log();
