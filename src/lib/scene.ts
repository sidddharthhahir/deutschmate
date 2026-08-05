/** Which brief the tutor is given. Only the first was resolving. */

export type Scene = { role: string; goal: string; opener: string };

/** What you get when nothing resolves. Deliberately bland and obviously generic. */
export const GENERIC: Scene = {
  role: "a friendly German speaker",
  goal: "have a short chat",
  opener: "Hallo!",
};

/**
 * Resolve a scene from whichever source has one. Anything malformed loses to the generic scene
 * rather than throwing — a bad content blob must not end a conversation.
 */
export function resolveScene(
  survival: Partial<Scene> | undefined,
  unitScenarioJson: string | null | undefined,
): Scene {
  if (survival?.role && survival.goal) return { ...GENERIC, ...survival };

  if (unitScenarioJson) {
    try {
      const parsed = JSON.parse(unitScenarioJson) as Partial<Scene>;
      if (parsed?.role && parsed.goal) return { ...GENERIC, ...parsed };
    } catch {
      /* fall through */
    }
  }

  return GENERIC;
}

/** Did anything actually resolve, or is this the fallback? */
export const isGeneric = (s: Scene) =>
  s.role === GENERIC.role && s.goal === GENERIC.goal;
