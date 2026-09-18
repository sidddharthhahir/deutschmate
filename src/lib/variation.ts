/**
 * Deterministic content variation (personalization, spec Task 3/4).
 *
 * This module decides WHICH pre-approved variant to show; it never invents
 * one. Every string in VARIANT_SETS is picked from the same proper-noun list
 * `scripts/check-scenes.mts`'s NAMES already treats as safe, taught-nothing
 * vocabulary — nothing here is new content, only a different arrangement of
 * content the curriculum already trusts.
 *
 * Selection is a pure function of (userId, exerciseId, repetition): same
 * three inputs always produce the same variant, so a page refresh never
 * changes what's shown, but a genuinely new repetition can. There is no
 * randomness — `Math.random()` never appears here — because "deterministic"
 * is a testability requirement, not a style preference: a test has to be
 * able to assert the exact output for a given seed.
 */

/**
 * Only "name" is actually wired into any rendered content in V1 (unit 1's
 * self-introduction line — see ConversationBlock.tsx's `resolveTemplate`).
 * The rest exist as tested infrastructure for a future pass, once specific
 * curriculum content is authored with the {{token}} convention this module
 * expects — see PERSONALIZATION_IMPLEMENTATION_REPORT.md §9 for why that
 * wasn't done broadly in this one.
 *
 * "Sam" and "Lena" are deliberately excluded from `name`: Sam is the
 * original static text (kept as the fallback a missing variant would show
 * anyway), and Lena is the OTHER speaker's name one line later in the same
 * scene — offering it back as the learner's own name would read as the
 * scene talking to itself.
 */
export const VARIANT_SETS = {
  name: ["Mira", "Jan", "Anna", "Tom", "Max", "Sarah"],
  city: ["Berlin", "München", "Hamburg", "Köln"],
  country: ["Kanada", "Indien"],
} as const;

export type VariantCategory = keyof typeof VARIANT_SETS;

/**
 * A small, stable string hash (djb2-ish). Not for security — only so the
 * same seed always lands on the same array index, deterministically, without
 * pulling in a crypto import for something that never has to resist an
 * attacker, only a page refresh.
 */
function stableHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export type VariantSeed = {
  userId: string;
  exerciseId: string;
  /** How many times this learner has met this exact exercise before. 0 the first time. */
  repetition: number;
};

/**
 * The approved variant for this seed, or null when the category doesn't
 * exist or has no options — the caller's job is to fall back to the
 * original static content in that case, never to render nothing.
 */
export function pickVariant(
  category: VariantCategory,
  seed: VariantSeed,
): string | null {
  const options: readonly string[] = VARIANT_SETS[category] ?? [];
  if (options.length === 0) return null;
  const key = `${seed.userId}:${seed.exerciseId}:${seed.repetition}`;
  const index = stableHash(key) % options.length;
  return options[index];
}

/**
 * Replace `{{category}}` tokens in `text` with an approved variant, or leave
 * the token's category name showing literally if that category is unknown —
 * that shape is easy to spot in review and impossible to mistake for normal
 * German, unlike silently swallowing an authoring typo.
 *
 * Missing variants (an empty options list) leave the ORIGINAL text alone:
 * pass `fallback` (the static, un-templated string) and it's returned
 * whenever nothing in `text` needed resolving or a category came back null.
 */
export function resolveTemplate(
  text: string,
  fallback: string,
  seed: Omit<VariantSeed, "exerciseId"> & { exerciseId: string },
): string {
  if (!text.includes("{{")) return text;
  let sawUnresolved = false;
  const resolved = text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => {
    const picked = isVariantCategory(name) ? pickVariant(name, seed) : null;
    if (picked === null) {
      sawUnresolved = true;
      return whole;
    }
    return picked;
  });
  return sawUnresolved ? fallback : resolved;
}

function isVariantCategory(v: string): v is VariantCategory {
  return v in VARIANT_SETS;
}
