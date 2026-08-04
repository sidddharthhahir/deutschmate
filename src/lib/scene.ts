/**
 * Which brief the tutor is given. Pure — no database, no filesystem.
 *
 * Two different things call the conversation route: a course unit, and one of
 * the Alltag survival scenarios. Only the first was resolving. The Alltag
 * pages pass an id like "surv-anmeldung", the route looked it up in the `unit`
 * table, found nothing, and fell back to "a friendly German speaker having a
 * short chat" — so all six of those conversations ran with the wrong brief
 * while the page beside them displayed the right one. A Bürgeramt clerk in the
 * heading and a chatty stranger in the prompt.
 *
 * Split out here because that failure is invisible from the outside: the
 * conversation still works, it is just the wrong conversation, and no error is
 * raised at any point.
 */

export type Scene = { role: string; goal: string; opener: string };

/** What you get when nothing resolves. Deliberately bland and obviously generic. */
export const GENERIC: Scene = {
  role: "a friendly German speaker",
  goal: "have a short chat",
  opener: "Hallo!",
};

/**
 * Resolve a scene from whichever source has one.
 *
 * The caller does the two lookups and hands both in, so the precedence and the
 * failure handling live in one testable place.
 *
 * A scene needs a role and a goal to be worth using; an opener is optional and
 * falls back to "Hallo!". Anything malformed loses to the generic scene rather
 * than throwing — a bad content blob must not end a conversation.
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
export const isGeneric = (s: Scene) => s.role === GENERIC.role && s.goal === GENERIC.goal;
