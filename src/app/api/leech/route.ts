import { NextResponse } from "next/server";
import { activeUser } from "@/lib/user";
import { readJson, badRequest, str, int } from "@/lib/http";
import {
  LEECH_THRESHOLD,
  clozeLeech,
  leechCount,
  leeches,
  resetLeech,
  suspendLeech,
} from "@/lib/leech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await activeUser(new URL(req.url).searchParams.get("user") ?? undefined);
  return NextResponse.json({
    threshold: LEECH_THRESHOLD,
    count: leechCount(user.id),
    leeches: leeches(user.id),
  });
}

/** POST — one of the three ways out. Each is reversible except the reset. */
const ACTIONS = ["reset", "pause", "resume", "cloze"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(str(raw.user) || undefined);

  const cardId = int(raw.cardId, 1);
  const action = str(raw.action, 20) as Action;
  if (cardId === null || !ACTIONS.includes(action)) {
    return badRequest(`cardId (positive integer) and action (${ACTIONS.join("|")}) required`);
  }

  let ok = false;
  switch (action) {
    case "reset":
      ok = resetLeech(user.id, cardId);
      break;
    case "pause":
      ok = suspendLeech(user.id, cardId, true);
      break;
    case "resume":
      ok = suspendLeech(user.id, cardId, false);
      break;
    case "cloze":
      ok = clozeLeech(user.id, cardId);
      break;
  }

  // `cloze` reports false when the word has no usable example sentence, or the
  // gap already exists. The UI says which — it never claims a card was made.
  return NextResponse.json({ ok, count: leechCount(user.id) });
}
