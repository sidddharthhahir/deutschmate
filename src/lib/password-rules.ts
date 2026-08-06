/**
 * The password rules, with no crypto import, so the sign-in form can state them
 * without pulling node:crypto into the browser bundle. password.ts enforces
 * them; this file is where the numbers live, once.
 *
 * Long, not clever. Composition rules ("one capital, one symbol") push people to
 * Passwort1! and buy nothing; length is what costs an attacker. Eight is the
 * floor because this is a German course on a flatmate's laptop, not a bank.
 */
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;
