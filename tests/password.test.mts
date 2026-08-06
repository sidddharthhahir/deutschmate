/**
 * Passwords and recovery codes.
 * needs: nothing
 */
import { ok, eq, section, done } from "./harness.mts";
import {
  hashPassword,
  verifyPassword,
  passwordProblem,
  newRecoveryCode,
  normaliseRecoveryCode,
  hashRecoveryCode,
  verifyRecoveryCode,
  MIN_PASSWORD,
} from "../src/lib/password.ts";

section("a password round-trips, and only the right one");
const stored = hashPassword("guten morgen 42");
ok(verifyPassword("guten morgen 42", stored), "the password it was made from");
ok(
  !verifyPassword("guten morgen 43", stored),
  "a near miss is not close enough",
);
ok(!verifyPassword("", stored), "empty");
ok(!verifyPassword("guten morgen 42", null), "no stored hash means no");
ok(!verifyPassword("guten morgen 42", ""), "an empty stored hash means no");

section("the stored form gives nothing away");
ok(!stored.includes("guten"), "the password is not in it");
ok(stored.startsWith("s1$"), "versioned, so a future algorithm is detectable");
eq(stored.split("$").length, 3, "version, salt, hash");

section("the same password twice is two different rows");
const a = hashPassword("dasselbe wort");
const b = hashPassword("dasselbe wort");
ok(a !== b, "per-user salt — equal passwords must not look equal in the table");
ok(
  verifyPassword("dasselbe wort", a) && verifyPassword("dasselbe wort", b),
  "both still verify",
);

section("a corrupt or ancient stored value is a no, never a crash");
/*
 * "s1$!!$!!" is the one that mattered. base64url decoding does not throw on
 * rubbish, it yields an empty buffer — and timingSafeEqual(empty, empty) is
 * true, so before the length check this row accepted every password.
 */
for (const bad of [
  "",
  "nonsense",
  "s1$",
  "s1$only-salt",
  "s9$aa$bb",
  "$$",
  "s1$!!$!!",
  "s1$$",
  "s1$AAAA$AAAA",
]) {
  ok(
    verifyPassword("guten morgen 42", bad) === false,
    `refused: "${bad.slice(0, 14)}"`,
  );
  ok(
    verifyPassword("etwas ganz anderes", bad) === false,
    `  and refused a different password too`,
  );
}

section("unicode normalises, so the same typed password works on any keyboard");
const umlaut = hashPassword("straßenbahnü");
ok(
  verifyPassword("straßenbahnü", umlaut),
  "combining diaeresis matches the composed form",
);

section("the rules say what is wrong, in words");
eq(passwordProblem("guten morgen 42"), null, "a fine password has no problem");
ok(
  passwordProblem("kurz")?.includes(String(MIN_PASSWORD)),
  "too short says how short",
);
ok(passwordProblem(" leerzeichen ") !== null, "surrounding spaces are refused");
ok(passwordProblem("x".repeat(500)) !== null, "absurdly long is refused");
eq(
  passwordProblem("x".repeat(MIN_PASSWORD)),
  null,
  "exactly the minimum is allowed",
);

section("recovery codes are readable and unguessable");
const code = newRecoveryCode();
ok(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(code), "four groups of four", code);
ok(!/[O01IL]/.test(code), "none of the characters people confuse on paper");
const many = new Set(Array.from({ length: 500 }, () => newRecoveryCode()));
eq(many.size, 500, "500 codes, 500 distinct");

section("a code copied off paper still works");
const c = newRecoveryCode();
const h = hashRecoveryCode(c);
ok(verifyRecoveryCode(c, h), "exactly as printed");
ok(verifyRecoveryCode(c.toLowerCase(), h), "lower case");
ok(verifyRecoveryCode(c.replace(/-/g, ""), h), "without the dashes");
ok(verifyRecoveryCode(` ${c.replace(/-/g, " ")} `, h), "with spaces instead");
ok(!verifyRecoveryCode(newRecoveryCode(), h), "a different code does not");
ok(!verifyRecoveryCode("", h), "empty does not");
ok(!verifyRecoveryCode(c, null), "no stored code means no");
eq(
  normaliseRecoveryCode("x7k2-9pqr"),
  "X7K29PQR",
  "normalising is upper and bare",
);

section("the stored code is a hash, not the code");
ok(
  !h.includes(c.replace(/-/g, "")),
  "the code itself is not in the stored value",
);
eq(h.length, 64, "sha256 hex");

done();
