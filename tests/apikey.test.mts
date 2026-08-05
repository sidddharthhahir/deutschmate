/**
 * Holding somebody else's API key. So the checks here are about what a copy of the database would
 * reveal, and about the app never being tricked into handing a key back.
 * needs: seeded database
 */
import { ok, eq, section, done, open } from "./harness.mts";
import {
  decrypt,
  encrypt,
  forgetMasterKey,
  hintOf,
  secretsAvailable,
  MIN_SECRET,
} from "../src/lib/secrets.ts";
import {
  budgetFor,
  clearApiKey,
  keyFor,
  keyState,
  looksLikeKey,
  setApiKey,
  setBudget,
} from "../src/lib/apikey.ts";
import { createUser } from "../src/lib/accounts.ts";

/* A secret of our own, so the test never depends on how the machine is set up
   and never touches the real one. Restored at the end. */
const REAL_SECRET = process.env.DEUTSCHMATE_SECRET;
const REAL_SERVER_KEY = process.env.ANTHROPIC_API_KEY;
process.env.DEUTSCHMATE_SECRET = "t".repeat(48);
delete process.env.ANTHROPIC_API_KEY;
forgetMasterKey();

const U = "test-apikey";
const restore = () => {
  const d = open();
  d.prepare("DELETE FROM user WHERE id = ?").run(U);
  d.close();
  if (REAL_SECRET === undefined) delete process.env.DEUTSCHMATE_SECRET;
  else process.env.DEUTSCHMATE_SECRET = REAL_SECRET;
  if (REAL_SERVER_KEY !== undefined)
    process.env.ANTHROPIC_API_KEY = REAL_SERVER_KEY;
};
restore();
process.env.DEUTSCHMATE_SECRET = "t".repeat(48);
delete process.env.ANTHROPIC_API_KEY;
forgetMasterKey();
process.on("exit", restore);

const KEY = "sk-ant-api03-" + "A1b2C3d4E5f6G7h8".repeat(3);

section("a key is recognised by shape, not by hope");
ok(looksLikeKey(KEY), "a real-looking key");
ok(!looksLikeKey("hunter2"), "a password is not one");
ok(!looksLikeKey("sk-ant-"), "the prefix alone is not one");
ok(!looksLikeKey(""), "nor is nothing");
ok(looksLikeKey(`  ${KEY}  `), "surrounding whitespace from a paste is fine");

section("encryption round-trips, and does not look like the input");
ok(secretsAvailable(), "a master secret is configured");
const packed = encrypt(KEY);
ok(!packed.includes(KEY), "the ciphertext does not contain the key");
ok(
  packed.startsWith("v1."),
  "it is versioned, so a future algorithm is detectable",
);
eq(decrypt(packed), KEY, "and it comes back exactly");
ok(
  encrypt(KEY) !== encrypt(KEY),
  "two encryptions differ — the IV is fresh each time",
);

section("a tampered or unreadable ciphertext yields nothing, never a guess");
const [v, iv, tag, body] = packed.split(".");
eq(
  decrypt(`${v}.${iv}.${tag}.${body.slice(0, -4)}AAAA`),
  null,
  "flipped ciphertext: authenticated, so it fails",
);
eq(
  decrypt(`${v}.${iv}.AAAAAAAAAAAAAAAAAAAAAA.${body}`),
  null,
  "wrong auth tag",
);
eq(decrypt("v2." + packed.slice(3)), null, "an unknown version");
eq(decrypt("nonsense"), null, "not even the right shape");
eq(decrypt(null), null, "nothing at all");

section("rotating the master secret makes stored keys unreadable, not wrong");
process.env.DEUTSCHMATE_SECRET = "u".repeat(48);
forgetMasterKey();
eq(decrypt(packed), null, "the old ciphertext no longer decrypts");
process.env.DEUTSCHMATE_SECRET = "t".repeat(48);
forgetMasterKey();
eq(decrypt(packed), KEY, "and reads again once the secret is back");

section(
  "without a master secret it refuses to store, rather than storing plainly",
);
process.env.DEUTSCHMATE_SECRET = "too-short";
forgetMasterKey();
ok(
  !secretsAvailable(),
  `a secret under ${MIN_SECRET} characters does not count`,
);
let threw = false;
try {
  encrypt(KEY);
} catch {
  threw = true;
}
ok(threw, "encrypt() refuses rather than returning something readable");
process.env.DEUTSCHMATE_SECRET = "t".repeat(48);
forgetMasterKey();

section("the stored row does not contain the key");
const user = createUser(U);
ok(setApiKey(user.id, KEY), "stored");
{
  const db = open();
  const row = db
    .prepare("SELECT api_key_enc, api_key_hint FROM user WHERE id = ?")
    .get(user.id) as { api_key_enc: string; api_key_hint: string };
  db.close();
  ok(
    !row.api_key_enc.includes(KEY),
    "the column holds ciphertext, not the key",
  );
  ok(
    !row.api_key_enc.includes(KEY.slice(0, 20)),
    "not even a recognisable prefix of it",
  );
  eq(
    row.api_key_hint,
    hintOf(KEY),
    "only the last four are stored in the clear",
  );
  eq(row.api_key_hint.length, 4, "and four characters is not a key");
}

section("what the settings page is allowed to know");
const st = keyState(user.id);
eq(st.state, "set", "that there is one");
ok(
  st.state === "set" && st.hint === KEY.slice(-4),
  "and its last four characters",
);
ok(
  !JSON.stringify(st).includes(KEY),
  "the state object never carries the key itself",
);

section("but the app can still call with it");
eq(keyFor(user.id), KEY, "keyFor returns the real key, for making a request");

section("garbage is refused before it is ever stored");
ok(!setApiKey(user.id, "hunter2"), "a non-key is not stored");
eq(keyFor(user.id), KEY, "and the good one is untouched");

section("removing means removing");
clearApiKey(user.id);
eq(keyState(user.id).state, "none", "the state says none");
eq(keyFor(user.id), null, "and there is nothing to call with");
{
  const db = open();
  const row = db
    .prepare("SELECT api_key_enc FROM user WHERE id = ?")
    .get(user.id) as {
    api_key_enc: string | null;
  };
  db.close();
  eq(
    row.api_key_enc,
    null,
    "the ciphertext is gone from the row, not just hidden",
  );
}

section("one learner's key is not another's");
const other = createUser("test-apikey-2");
setApiKey(user.id, KEY);
eq(keyFor(other.id), null, "the second learner has none of their own");
{
  const db = open();
  db.prepare("DELETE FROM user WHERE id = ?").run(other.id);
  db.close();
}

section("the server's own key is a fallback, never an override");
process.env.ANTHROPIC_API_KEY = "sk-ant-server-fallback-key-000000000000";
eq(keyFor(user.id), KEY, "a learner with their own key uses theirs");
const third = createUser("test-apikey-3");
eq(
  keyFor(third.id),
  process.env.ANTHROPIC_API_KEY,
  "one without falls back to the server's",
);
{
  const db = open();
  db.prepare("DELETE FROM user WHERE id = ?").run(third.id);
  db.close();
}
delete process.env.ANTHROPIC_API_KEY;

section("the ceiling is theirs, and zero is a real answer");
eq(budgetFor(user.id, 5), 5, "unset means the deployment default");
setBudget(user.id, 2.5);
eq(budgetFor(user.id, 5), 2.5, "set means theirs");
setBudget(user.id, 0);
eq(budgetFor(user.id, 5), 0, "zero is kept, not treated as unset");
setBudget(user.id, null);
eq(budgetFor(user.id, 5), 5, "and null puts the default back");

done();
