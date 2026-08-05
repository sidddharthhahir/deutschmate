import { readFileSync } from "node:fs";
import path from "node:path";
import type { Scenario } from "./ai";

/**
 * Survival-Deutsch — the conversations you will actually have. None of them is the Bürgeramt, and
 * the Bürgeramt is the one you cannot avoid and cannot postpone.
 */

export type Survival = {
  id: string;
  level: string;
  ord: number;
  title: string;
  /** Why this one matters — the stakes, not a lesson objective. */
  why: string;
  /** What to physically take with you. */
  bring: string[];
  scenario: Scenario;
  /** What you say. */
  phrases: { de: string; en: string }[];
  /**
   * What THEY say — the half that was missing. Every one of these taught output only, and that is
   * not how the appointments fail.
   */
  hear?: { de: string; en: string }[];
  /** The offline path, and it used to be missing on exactly the wrong six. */
  dialogue?: DialogueTurn[];
};

export type DialogueTurn = {
  them: string;
  options: { say: string; ok: boolean; why?: string; next: number }[];
};

let cache: Survival[] | null = null;

export function survivalScenarios(): Survival[] {
  if (cache) return cache;
  try {
    const raw = readFileSync(
      path.join(process.cwd(), "data", "scenarios-survival.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as Survival[];
    cache = Array.isArray(parsed) ? parsed.sort((a, b) => a.ord - b.ord) : [];
  } catch {
    // Missing or malformed content must not take a page down.
    cache = [];
  }
  return cache;
}

export function survivalById(id: string): Survival | undefined {
  return survivalScenarios().find((s) => s.id === id);
}
