/** German plural agreement for counted things. */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Just the noun, when the number is rendered separately. */
export function word(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * Verb agreement, for the handful of sentences that carry one. "1 Regeln **sind** eingeführt" is
 * wrong twice over, and fixing only the noun leaves it wrong once.
 */
export function is(count: number): string {
  return count === 1 ? "ist" : "sind";
}
