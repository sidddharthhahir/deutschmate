/**
 * What a model call costs, and the ceiling that stops it.
 * needs: nothing
 */
import { priceOf, isPriced, ceiling } from "../src/lib/pricing.ts";
import { catalogue, modelById, modelFor } from "../src/lib/models.ts";
import { ok, eq, section, done } from "./harness.mts";

const usage = (u: Partial<Record<string, number>>) =>
  ({
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    ...u,
  }) as Parameters<typeof priceOf>[1];

section("the catalogue is loadable and internally consistent");
/* It is data now (data/models.json), so the first thing worth checking is that
   it parses, validates, and still contains what the code asks it for. A price
   table that fails to load must fail loudly at startup, not price everything
   at zero. */
const cat = catalogue();
ok(
  /^\d{4}-\d{2}-\d{2}$/.test(cat.as_of),
  "it says when it was last checked",
  cat.as_of,
);
ok(
  Boolean(modelById(modelFor("quality"))),
  "the quality role names a listed model",
);
ok(Boolean(modelById(modelFor("cheap"))), "so does the cheap one");
for (const m of cat.models) {
  ok(
    m.in > 0 && m.out > 0 && m.out >= m.in,
    `${m.id}: output costs at least input`,
  );
}

section("published rates");
eq(modelById("claude-sonnet-5")?.in, 3, "sonnet-5 input is $3/M");
eq(modelById("claude-sonnet-5")?.out, 15, "sonnet-5 output is $15/M");
eq(modelById("claude-haiku-4-5")?.in, 1, "haiku-4.5 input is $1/M");
eq(cat.cache.read, 0.1, "a cache read is a tenth of input");
eq(cat.cache.write_5m, 1.25, "a 5-minute cache write is 1.25x");
eq(
  cat.cache.write_1h,
  2,
  "a 1-hour one is 2x — which is the TTL the tutor prompt uses",
);

section("priceOf, in micros");
eq(
  priceOf("claude-sonnet-5", usage({ input_tokens: 1_000_000 })),
  3_000_000,
  "1M input tokens on sonnet-5 is $3",
);
eq(
  priceOf("claude-sonnet-5", usage({ output_tokens: 1_000_000 })),
  15_000_000,
  "1M output tokens is $15",
);
eq(
  priceOf("claude-sonnet-5", usage({ cache_read_input_tokens: 1_000_000 })),
  300_000,
  "1M cached input tokens is 30 cents",
);
eq(priceOf("claude-sonnet-5", usage({})), 0, "an empty call is free");

section("the write multiplier follows the TTL that was actually used");
/* The old constant was 1.25 — the 5-minute rate — while ai.ts writes the tutor
   prompt with a 1-hour TTL, which is 2x. The comment admitted the gap and kept
   under-reporting every conversation. With per-learner keys that is the app
   being wrong about somebody else's money. */
const write5m = priceOf(
  "claude-sonnet-5",
  usage({ cache_creation_input_tokens: 1_000_000 }),
  "5m",
);
const write1h = priceOf(
  "claude-sonnet-5",
  usage({ cache_creation_input_tokens: 1_000_000 }),
  "1h",
);
eq(write5m, 3_750_000, "1M tokens written at the 5-minute rate is $3.75");
eq(write1h, 6_000_000, "at the 1-hour rate it is $6.00");
ok(write1h > write5m, "and the longer TTL is never the cheaper number");

section("caching is the thing that makes this affordable");
/* The tutor prompt is the vocabulary whitelist — thousands of tokens, identical
   every turn. This is the comparison the cache_control marker exists for, and
   it is priced at the 1-hour rate the code actually asks for. */
const VOCAB = 5_000;
const uncached = priceOf(
  "claude-sonnet-5",
  usage({ input_tokens: VOCAB * 20 }),
);
const cached =
  priceOf(
    "claude-sonnet-5",
    usage({ cache_creation_input_tokens: VOCAB }),
    "1h",
  ) +
  priceOf("claude-sonnet-5", usage({ cache_read_input_tokens: VOCAB * 19 }));
ok(
  cached < uncached / 4,
  "20 turns of a 5k-token prompt cost under a quarter cached",
  `${(uncached / 1e6).toFixed(3)} → ${(cached / 1e6).toFixed(3)} $`,
);

section("an unknown model is never guessed at, and says so");
/*
 * Returning a plausible number for a model whose price we do not know would put a wrong figure on
 * the page that reads exactly like a right one.
 */
eq(
  priceOf("claude-something-unreleased", usage({ input_tokens: 1_000_000 })),
  0,
  "unknown models price at zero rather than an invented rate",
);
eq(
  isPriced("claude-something-unreleased"),
  false,
  "and are reported as unpriced",
);
eq(isPriced("claude-sonnet-5"), true, "a known one is not");

section("the ceiling");
const saved = process.env.DEUTSCHMATE_BUDGET;
delete process.env.DEUTSCHMATE_BUDGET;
eq(
  ceiling(),
  5,
  "defaults to $5 per user — $10 for the two people this was built for",
);
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
