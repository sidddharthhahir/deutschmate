/**
 * The one onboarding question, and its fixed answers. Plain data, no server
 * import — a client component (willkommen/Situation.tsx) and a server route
 * (api/situation) both need the same list, and it must not drag node:sqlite
 * into a "use client" file.
 */
export const SITUATIONS = [
  { value: "moving_soon", label: "I am moving to Germany soon" },
  { value: "just_arrived", label: "I just arrived in Germany" },
  { value: "few_months", label: "I have been here for a few months" },
  { value: "university", label: "I am preparing for university" },
  { value: "student_job", label: "I want German for a student job" },
  { value: "everyday", label: "I am learning German for everyday life" },
] as const;

export type Situation = (typeof SITUATIONS)[number]["value"];

export function isSituation(v: unknown): v is Situation {
  return (
    typeof v === "string" && SITUATIONS.some((s) => s.value === v)
  );
}
