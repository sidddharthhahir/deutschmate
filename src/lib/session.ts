/**
 * The session runner (spec §3). The rhythm never changes so it becomes a habit; the scheduler
 * picks what fills each block.
 *
 * Split by responsibility across sibling `session-*.ts` files. This barrel re-exports what other
 * modules actually import as `@/lib/session` — everything else (the `Block`/`Unit`/`Grammar`/
 * `Word`/`SessionPlan`/`SessionMode` types, `newWordBudget`, `unitsFor`, `unitCount`, `pastUnits`)
 * has no outside caller and is available directly from its own file if that changes:
 *   session-types.ts        the shapes
 *   session-pacing.ts       how many new words today
 *   session-progression.ts  unlocking, current/past units, streak-adjacent lookups
 *   session-content.ts      corpus sentences, listening/builder items, drills, writing prompts
 *   session-builder.ts      buildSession — assembles the six blocks
 *   session-log.ts          logSession, currentStreak
 */

export {
  LEVELS,
  currentUnit,
  paceProjection,
  unseenInUnit,
  markUnitComplete,
  knownVocabulary,
} from "./session-progression";

export { buildSession } from "./session-builder";

export { logSession, currentStreak } from "./session-log";
