import { NextResponse } from "next/server";
import { activeUser } from "@/lib/user";
import { readJson, badRequest, str, int, unauthorized } from "@/lib/http";
import {
  addCloze,
  clozeTotal,
  dueCloze,
  clozeDueCount,
  deleteCloze,
} from "@/lib/cloze";
import { blankWord } from "@/lib/cloze-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the gaps due right now. Grading goes through /api/review like any card. */
export async function GET(req: Request) {
  const user = await activeUser(req);
  if (!user) return unauthorized();
  return NextResponse.json({
    cards: dueCloze(user.id, 12),
    due: clozeDueCount(user.id),
    total: clozeTotal(user.id),
  });
}

/** POST — mine a sentence the learner is looking at right now. */
export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(req, raw);
  if (!user) return unauthorized();

  // str() coerces rather than assuming: a numeric `word` used to reach
  // .trim() and throw, which the client saw as a bare 500.
  const sentence = str(raw.sentence, 400);
  const word = str(raw.word, 80);
  if (!sentence || !word) return badRequest("sentence and word required");

  const gap = blankWord(sentence, word);
  if (!gap) {
    return NextResponse.json(
      { ok: false, reason: "Wort nicht im Satz gefunden" },
      { status: 422 },
    );
  }

  const created = addCloze({
    userId: user.id,
    full: sentence,
    sentence: gap.sentence,
    answer: gap.answer,
    en: str(raw.en) || null,
    source: "reading",
    sourceRef: str(raw.sourceRef, 80) || null,
  });

  // `created: false` means the identical gap already exists. Reporting that as
  // a distinct outcome, not as success, keeps the button honest.
  return NextResponse.json({
    ok: true,
    created,
    sentence: gap.sentence,
    answer: gap.answer,
  });
}

/** DELETE — remove a gap the learner doesn't want. Takes its card with it. */
export async function DELETE(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(req, raw);
  if (!user) return unauthorized();

  const id = int(raw.id, 1);
  if (id === null) return badRequest("id (positive integer) required");

  const gone = deleteCloze(user.id, id);
  // false means it wasn't yours or wasn't there — either way nothing changed,
  // and the UI should say so rather than fade a row out optimistically.
  return NextResponse.json({ ok: gone, total: clozeTotal(user.id) });
}
