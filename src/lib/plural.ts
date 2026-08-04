/**
 * German plural agreement for counted things.
 *
 * The app writes sentences about numbers it does not know in advance, and the
 * numbers reach 1 more often than the code assumed: one card due, one rule
 * introduced, one word carried into tomorrow. Every one of those printed as
 * "1 Karten fällig", "1 Regeln sind eingeführt", "1 Wörter" — a machine's
 * German, on a screen whose whole purpose is teaching the language it is
 * getting wrong.
 *
 * This is the least interesting bug in the app and the most visible. It cannot
 * be caught by a type, a test of behaviour, or a scan of the source, because
 * every one of those strings is correct for every value except one.
 *
 * `plural(1, "Karte", "Karten")` → "1 Karte".
 *
 * Named in full rather than `n`, which is already a local helper in
 * /fortschritt for counting rows — two one-letter names meaning different
 * things in the same file is how the next mistake gets made.
 */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Just the noun, when the number is rendered separately. */
export function word(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * Verb agreement, for the handful of sentences that carry one.
 *
 * "1 Regeln **sind** eingeführt" is wrong twice over, and fixing only the noun
 * leaves it wrong once.
 */
export function is(count: number): string {
  return count === 1 ? "ist" : "sind";
}
