/**
 * What is this install configured to do?
 *
 *   npm run config
 *
 * Every `process.env` read in the app used to have its own fallback, and every
 * one failed silently: `DEUTSCHMATE_BUDGT=5` is not an error, it is a budget of
 * $5 because the misspelled name was never read. Nothing anywhere says so.
 *
 * Now there is one place to ask. Prints the effective value of every setting,
 * the model catalogue it will price with, and anything that looks wrong.
 *
 * Prints no secrets — only whether each one is present.
 */
import "./load-env.mts";
import { check, describe, baseUrl } from "../src/lib/env.ts";
import { priceList } from "../src/lib/models.ts";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

console.log("\nDeutschMate — configuration\n");

for (const row of describe()) {
  console.log(`  ${row.name.padEnd(24)} ${row.value.padEnd(28)} ${dim(row.note)}`);
}

const prices = priceList();
console.log(`\n  Preise vom ${prices.asOf}   ${dim(prices.source)}`);
for (const m of prices.models) {
  console.log(
    `    ${m.id.padEnd(20)} ${`$${m.in}/M in`.padEnd(12)} ${`$${m.out}/M out`.padEnd(13)} ${dim(
      `${(m.context / 1000).toFixed(0)}k context`,
    )}`,
  );
}
console.log(
  dim(
    `    cache: read ${prices.cache.read}x · write ${prices.cache.write_5m}x (5 min) / ${prices.cache.write_1h}x (1 h)`,
  ),
);

const issues = check();
console.log("");
if (!issues.length) {
  console.log(`  ${green("✓")} nothing looks wrong`);
} else {
  for (const i of issues) {
    const mark = i.level === "error" ? red("✕") : yellow("!");
    console.log(`  ${mark} ${i.name}  ${i.message}`);
  }
}

console.log(`\n  Sign-in links will point at ${baseUrl()}\n`);
