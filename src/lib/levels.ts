/**
 * The six-level course scale. Zero dependencies, deliberately: `session.ts` (reached only through
 * Next's bundler) and `exam.ts` (imported directly by a plain-Node test, so its whole import chain
 * must resolve without a bundler) both need this array to be the same array, not two copies.
 */
export const LEVELS = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2"] as const;
export type Level = (typeof LEVELS)[number];
