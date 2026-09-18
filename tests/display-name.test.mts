/**
 * The preferred-name sanitiser — trims, length-limits, and character-limits
 * a display name that is never the login username.
 * needs: nothing
 */
import {
  displayNameProblem,
  sanitizeDisplayName,
  greetingName,
  MAX_DISPLAY_NAME,
} from "../src/lib/display-name.ts";
import { ok, eq, section, done } from "./harness.mts";

section("what's accepted at write time");
eq(displayNameProblem("Mira"), null, "a plain name is fine");
eq(displayNameProblem("  Mira  "), null, "surrounding whitespace is trimmed first");
eq(displayNameProblem(""), null, "empty is a skip, not an error");
eq(displayNameProblem("   "), null, "whitespace-only is also a skip");
eq(displayNameProblem("Müller"), null, "umlauts are fine — this is a German course");
eq(displayNameProblem("Anh-Thư"), null, "hyphen and non-Latin letters are fine");
eq(displayNameProblem("O'Brien"), null, "apostrophe is fine");
eq(displayNameProblem("María José"), null, "a space between two names is fine");

section("what's refused, and why");
ok(
  displayNameProblem("a".repeat(MAX_DISPLAY_NAME + 1)) !== null,
  `over ${MAX_DISPLAY_NAME} characters is refused`,
);
ok(displayNameProblem("Mira123") !== null, "digits are refused");
ok(displayNameProblem("<script>") !== null, "HTML-special characters are refused");
ok(displayNameProblem("Mira; DROP TABLE user;") !== null, "SQL-looking punctuation is refused");
ok(displayNameProblem("Mi\nra") !== null, "an embedded control character is refused");

section("sanitizeDisplayName is the same rule, applied to what's read back");
eq(sanitizeDisplayName("Mira"), "Mira", "a good value passes through unchanged");
eq(sanitizeDisplayName(null), null, "null stays null");
eq(sanitizeDisplayName(undefined), null, "undefined stays null");
eq(sanitizeDisplayName(""), null, "empty stays null");
eq(sanitizeDisplayName("   "), null, "whitespace-only stays null");
eq(
  sanitizeDisplayName("a".repeat(200)),
  null,
  "a value some other path let through too long is refused defensively, not truncated and shown",
);
eq(
  sanitizeDisplayName("<script>alert(1)</script>"),
  null,
  "a value that would never pass displayNameProblem is refused, not half-rendered",
);

section("greetingName is the same thing under the name callers actually want");
eq(greetingName("Mira"), "Mira", "same result as sanitizeDisplayName");
eq(greetingName(null), null, "null means: use a generic greeting");

section("existing users without a display name are unaffected");
/* The whole point of this being a separate, nullable column: an account
   that predates this feature has display_name = NULL, and every function
   here already treats that as "no name", not as an error. */
eq(greetingName(undefined), null, "no crash, no default name invented");

done();
