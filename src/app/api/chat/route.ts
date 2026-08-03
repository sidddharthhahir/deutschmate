import { NextResponse } from "next/server";
import { activeUser } from "@/lib/user";
import { readJson, str, arr } from "@/lib/http";
import { recordUsage } from "@/lib/cost";
import { knownVocabulary } from "@/lib/session";
import { converse, reviewConversation, aiAvailable, type Turn, type Scenario } from "@/lib/ai";
import { logAttempt, type Tag } from "@/lib/errors";
import { get } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Conversation. Two actions on one route:
 *   say    — one tutor turn, constrained to known vocabulary
 *   review — the post-conversation correction pass
 *
 * If there's no API key or the call fails, we return `offline: true` and the
 * client falls back to the unit's scripted dialogue. The session never
 * dead-ends (spec §17).
 */
export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(str(raw.user) || undefined);
  const action = str(raw.action, 20);

  /* Turns go straight to the model as `messages`, so anything malformed here
     becomes an opaque SDK error. Filter to the shape the API accepts. */
  const history: Turn[] = arr<Turn>(raw.history)
    .filter(
      (t) =>
        t &&
        typeof t === "object" &&
        (t.role === "user" || t.role === "assistant") &&
        typeof t.content === "string" &&
        t.content.trim().length > 0,
    )
    .slice(-40)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 2000) }));

  if (!aiAvailable()) {
    return NextResponse.json({ offline: true, reason: "no-api-key" });
  }

  try {
    if (action === "review") {
      const rev = await reviewConversation({ level: user.level, history });
      recordUsage(user.id, "review", rev.model, rev.usage);
      const corrections = rev.result;
      for (const c of corrections) {
        logAttempt({
          userId: user.id,
          kind: "conversation",
          correct: false,
          answer: c.original,
          expected: c.corrected,
          tags: [c.tag as Tag],
        });
      }
      return NextResponse.json({ corrections });
    }

    const unitId = str(raw.unitId, 40);
    const unit = unitId
      ? get<{ scenario_json: string | null }>(
          "SELECT scenario_json FROM unit WHERE id = ?",
          unitId,
        )
      : null;

    const fallback: Scenario = {
      role: "a friendly German speaker",
      goal: "have a short chat",
      opener: "Hallo!",
    };
    // A malformed scenario blob must not take the whole conversation down.
    let scenario = fallback;
    if (unit?.scenario_json) {
      try {
        const parsed = JSON.parse(unit.scenario_json) as Partial<Scenario>;
        if (parsed?.role && parsed?.goal) scenario = { ...fallback, ...parsed };
      } catch {
        /* keep the fallback */
      }
    }

    // The whitelist. Everything the learner has actually met, nothing else.
    const vocabulary = knownVocabulary(user.id);

    const { reply, model, usage } = await converse({
      level: user.level,
      vocabulary,
      scenario,
      history,
    });
    recordUsage(user.id, "chat", model, usage);

    return NextResponse.json({
      reply,
      vocabularySize: vocabulary.length,
      usage: {
        input: usage.input_tokens,
        output: usage.output_tokens,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
      },
    });
  } catch (e) {
    return NextResponse.json({
      offline: true,
      reason: e instanceof Error ? e.message : "call failed",
    });
  }
}
