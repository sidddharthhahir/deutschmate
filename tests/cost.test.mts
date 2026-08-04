/**
 * What a model call costs, and the ceiling that stops it.
 *
 * The $10/month budget is the one hard constraint on this project, and until
 * there was a guard it was a wish. These check the arithmetic the guard runs
 * on: an over-generous price would let spending past the ceiling, and a
 * silently-zero price would let it past unnoticed.
 *
 * needs: nothing
 */
import { priceOf, PRICES, CACHE_READ, CACHE_WRITE, ceiling } from "../src/lib/pricing.ts";
import { ok, eq, section, done } from "./harness.mts";

const usage = (u: Partial<Record<string, number>>) =>
  ({
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    ...u,
  }) as Parameters<typeof priceOf>[1];

section("published rates");
ok(PRICES["claude-sonnet-5"]?.in === 3, "sonnet-5 input is $3/M", PRICES["claude-sonnet-5"]?.in);
ok(PRICES["claude-sonnet-5"]?.out === 15, "sonnet-5 output is $15/M", PRICES["claude-sonnet-5"]?.out);
ok(PRICES["claude-haiku-4-5"]?.in === 1, "haiku-4.5 input is $1/M");
ok(CACHE_READ === 0.1, "a cache read is a tenth of input");
ok(CACHE_WRITE === 1.25, "a cache write is 1.25x — the 5-minute rate");

section("priceOf, in micros");
eq(priceOf("claude-sonnet-5", usage({ input_tokens: 1_000_000 })), 3_000_000,
  "1M input tokens on sonnet-5 is $3");
eq(priceOf("claude-sonnet-5", usage({ output_tokens: 1_000_000 })), 15_000_000,
  "1M output tokens is $15");
eq(priceOf("claude-sonnet-5", usage({ cache_read_input_tokens: 1_000_000 })), 300_000,
  "1M cached input tokens is 30 cents");
eq(priceOf("claude-sonnet-5", usage({})), 0, "an empty call is free");

section("caching is the thing that makes this affordable");
/* The tutor prompt is the vocabulary whitelist — thousands of tokens, identical
   every turn. This is the comparison the cache_control marker exists for. */
const VOCAB = 5_000;
const uncached = priceOf("claude-sonnet-5", usage({ input_tokens: VOCAB * 20 }));
const cached =
  priceOf("claude-sonnet-5", usage({ cache_creation_input_tokens: VOCAB })) +
  priceOf("claude-sonnet-5", usage({ cache_read_input_tokens: VOCAB * 19 }));
ok(cached < uncached / 4, "20 turns of a 5k-token prompt cost under a quarter cached",
  `${(uncached / 1e6).toFixed(3)} → ${(cached / 1e6).toFixed(3)} $`);

section("an unknown model is never guessed at");
/* Returning a plausible number for a model whose price we do not know would put
   a wrong figure on the page that reads exactly like a right one. */
eq(priceOf("claude-something-unreleased", usage({ input_tokens: 1_000_000 })), 0,
  "unknown models price at zero rather than an invented rate");

section("the ceiling");
const saved = process.env.DEUTSCHMATE_BUDGET;
delete process.env.DEUTSCHMATE_BUDGET;
eq(ceiling(), 5, "defaults to $5 per user — $10 for the two people this was built for");
process.env.DEUTSCHMATE_BUDGET = "12.5";
eq(ceiling(), 12.5, "reads DEUTSCHMATE_BUDGET");
process.env.DEUTSCHMATE_BUDGET = "0";
eq(ceiling(), 0, "zero is a real setting: no AI spending at all");
process.env.DEUTSCHMATE_BUDGET = "not a number";
eq(ceiling(), 5, "garbage falls back to the default rather than to Infinity");
process.env.DEUTSCHMATE_BUDGET = "-3";
eq(ceiling(), 5, "and so does a negative");
if (saved === undefined) delete process.env.DEUTSCHMATE_BUDGET;
else process.env.DEUTSCHMATE_BUDGET = saved;

done();
