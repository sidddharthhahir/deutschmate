/**
 * The name a learner is greeted by — separate from the login username
 * (lib/who.ts's `normalise()` lowercases and strips it to [a-z0-9_-], which
 * is fine for an id and wrong for a greeting). Optional, skippable, never
 * required.
 *
 * Every function here is pure. Nothing here touches the database, renders
 * HTML, or builds SQL — this module only decides whether a string is safe
 * to store or safe to show, so it can be tested without a server and reused
 * at both the write boundary (the settings route) and the read boundary
 * (defensive re-validation, in case a value ever reached the column some
 * other way).
 */

export const MAX_DISPLAY_NAME = 40;

/**
 * Letters (any script — a German course serves learners whose names are not
 * Latin-script, and rejecting those would be its own quiet bias), spaces,
 * hyphens and apostrophes only. No digits, no punctuation that means
 * anything to HTML or SQL, because the answer to "is this safe" should not
 * depend on downstream escaping doing its job.
 */
// A literal space, not \s: \s also matches tab, newline and other control-ish
// whitespace, which a display name has no legitimate reason to contain.
const ALLOWED = /^\p{L}[\p{L} '-]*$/u;

/** Why a display name was refused, in words a person can act on. Null when it's fine. */
export function displayNameProblem(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null; // empty is a skip, not an error — this field is never required
  if (trimmed.length > MAX_DISPLAY_NAME) {
    return `Höchstens ${MAX_DISPLAY_NAME} Zeichen.`;
  }
  if (!ALLOWED.test(trimmed)) {
    return "Nur Buchstaben, Leerzeichen, Bindestrich und Apostroph.";
  }
  return null;
}

/**
 * The stored value, or null if it is empty or fails the same rule
 * `displayNameProblem` enforces at write time. Re-checked here (not just
 * trusted from the database) so a value written by some future path — a
 * script, a restored backup from an older version — can never render
 * something this module wouldn't have accepted today.
 */
export function sanitizeDisplayName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Not sliced to length first: a value longer than the limit failed
  // displayNameProblem's own length check, so it is refused outright here
  // too, rather than quietly cropped into a different, "valid" string.
  const trimmed = raw.trim();
  if (!trimmed || displayNameProblem(trimmed)) return null;
  return trimmed;
}

/**
 * The name to greet someone by, or null for a generic greeting. A thin,
 * clearly-named alias over sanitizeDisplayName — callers that just want "is
 * there a safe name to use" read better without repeating the sanitiser's
 * own name.
 *
 * This is a plain string, always. Rendering it is the caller's job, through
 * ordinary JSX text interpolation — never dangerouslySetInnerHTML, never a
 * template string handed to a SQL statement outside a parameter.
 */
export function greetingName(
  displayName: string | null | undefined,
): string | null {
  return sanitizeDisplayName(displayName);
}
