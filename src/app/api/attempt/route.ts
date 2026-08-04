import { NextResponse } from "next/server";
import { activeUser } from "@/lib/user";
import { logAttempt, type Tag } from "@/lib/errors";
import { whyWrong } from "@/lib/why";
import { readJson, badRequest, str, bool, unauthorized } from "@/lib/http";
import { introduceWord } from "@/lib/srs";
import { introduceGrammar } from "@/lib/grammar-srs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Log an attempt and, when it's wrong, explain why.
 *
 * The explanation path is the write-through cache from spec §12:
 *   1. rule-based classification (free, offline, instant)
 *   2. cached explanation for this exact mistake (free, instant)
 *   3. only then a model call — and the result is stored, so the next person
 *      to make the same mistake gets it free.
 */
export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(req, raw);
  if (!user) return unauthorized();

  // `kind` is NOT NULL in the schema — without this check a body missing it
  // reached SQLite and came back as a 500 with an empty response.
  const kind = str(raw.kind, 40);
  if (!kind) return badRequest("kind is required");

  const refId = str(raw.refId, 80) || undefined;
  const correct = bool(raw.correct);
  const answer = str(raw.answer) || undefined;
  const expected = str(raw.expected) || undefined;

  const tags = logAttempt({
    userId: user.id,
    kind,
    refId,
    correct,
    answer,
    expected,
  });

  /* The recognition check that ends an introduction is the word's first rep —
     this is where it enters the deck and gets a schedule. Without it, a word
     could be taught every day forever and never once come back as a review. */
  if (kind === "new-vocab" && refId) {
    introduceWord(user.id, refId, correct);
  }

  // Same for a grammar point: the lesson's drills put it on the curve.
  if (kind === "new-grammar" && refId) {
    introduceGrammar(user.id, refId, correct);
  }

  if (correct || !bool(raw.explain) || !expected || !answer) {
    return NextResponse.json({ ok: true, tags });
  }

  /* Cache → cheap model → rule-based description. Shared with /api/review, so
     a wrong dictation and a wrong gap are answered the same way and by the
     same cache. Offline / no key / spent budget all land on the rule, which is
     still true — the session never dead-ends (spec §17). */
  const { text: explanation, source } = await whyWrong(
    user.id,
    expected,
    answer,
    tags as Tag[],
  );

  return NextResponse.json({ ok: true, tags, explanation, source });
}
