import { SITUATIONS, type Situation } from "./situation.ts";

export type { Situation };

/**
 * The one recommended next action for the home screen, derived from the
 * onboarding answer. Deliberately small: one lookup table, no scoring, no
 * ranking of multiple candidates — the brief for this is explicit that it
 * must not become a recommendation engine.
 *
 * Pure and deterministic on purpose, so it can be unit-tested without a
 * database: availability of university/job-specific content is passed in by
 * the caller (who actually knows what's seeded) rather than looked up here.
 * Today that's `hasUniversityContent: true` (the Prüfungsamt Alltag scenario
 * exists) and `hasJobContent: false` (nothing job-specific exists yet) — see
 * src/app/page.tsx and src/app/api/session/route.ts for where those flags
 * come from.
 */
export type Recommendation = {
  title: string;
  sub: string;
  href: string;
};

const DEFAULT: Recommendation = {
  title: "Weiter im Kurs",
  sub: "Deine heutige Sitzung wartet.",
  href: "/session",
};

const ALLTAG: Recommendation = {
  title: "Auf eine echte Situation vorbereiten",
  sub: "Übe ein Gespräch, das dich in Deutschland wirklich erwartet.",
  href: "/alltag",
};

export function recommendationFor(
  situation: Situation | string | null,
  opts: { hasUniversityContent?: boolean; hasJobContent?: boolean } = {},
): Recommendation {
  const { hasUniversityContent = true, hasJobContent = false } = opts;

  switch (situation) {
    case "moving_soon":
      return {
        title: "Die Basics für den Start",
        sub: "Bau vor der Ankunft die Wörter auf, die du sofort brauchst.",
        href: "/session",
      };
    case "just_arrived":
      return ALLTAG;
    case "university":
      return hasUniversityContent
        ? {
            title: "Fürs Prüfungsamt vorbereiten",
            sub: "Das Gespräch, das jede:r Studierende irgendwann führt.",
            href: "/alltag/surv-uni",
          }
        : ALLTAG;
    case "student_job":
      // No job-specific scenario exists yet — the honest answer is the
      // closest real content, not a manufactured "job" page.
      return hasJobContent
        ? ALLTAG
        : {
            title: "Das nächstbeste zum Vorstellungsgespräch",
            sub: "Noch kein eigenes Szenario dafür — das hier kommt am nächsten.",
            href: "/alltag",
          };
    case "everyday":
      return {
        title: "Kurs weiter, dazu Alltag",
        sub: "Der normale A1.1-Weg, plus echte Situationen nebenbei.",
        href: "/session",
      };
    default:
      return DEFAULT;
  }
}

/** Every situation this app knows, for tests that want to check all of them. */
export const KNOWN_SITUATIONS = SITUATIONS.map((s) => s.value);
