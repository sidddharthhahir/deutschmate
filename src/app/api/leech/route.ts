import { NextResponse } from "next/server";
import { activeUser } from "@/lib/user";
import { readJson, badRequest, notFound, str, int, unauthorized } from "@/lib/http";
import { aiAvailable, mnemonicFor, BudgetExceeded } from "@/lib/ai";
import { recordUsage } from "@/lib/cost";
import {
  LEECH_THRESHOLD,
  clozeLeech,
  leechCount,
  leechWord,
  leeches,
  resetLeech,
  storeMnemonic,
  suspendLeech,
} from "@/lib/leech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await activeUser(req);
  if (!user) return unauthorized();
  return NextResponse.json({
    threshold: LEECH_THRESHOLD,
    count: leechCount(user.id),
    leeches: leeches(user.id),
  });
}

/** POST — one of the ways out. Each is reversible except the reset. */
const ACTIONS = ["reset", "pause", "resume", "cloze", "mnemonic"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(req, raw);
  if (!user) return unauthorized();

  const cardId = int(raw.cardId, 1);
  const action = str(raw.action, 20) as Action;
  if (cardId === null || !ACTIONS.includes(action)) {
    return badRequest(`cardId (positive integer) and action (${ACTIONS.join("|")}) required`);
  }

  /* Ask for a memory hook. Three tiers like every other generated text: the
     stored one if anyone has ever asked for this word, then a model call that
     is written back, then nothing — and "nothing" says so rather than showing
     an empty box. */
  if (action === "mnemonic") {
    const w = leechWord(user.id, cardId);
    if (!w) return notFound(`card ${cardId} not found`);
    if (w.mnemonic) return NextResponse.json({ ok: true, mnemonic: w.mnemonic, source: "cache" });
    if (!aiAvailable()) return NextResponse.json({ ok: false, reason: "offline" });
    try {
      const m = await mnemonicFor(user.id, w);
      recordUsage(user.id, "mnemonic", m.model, m.usage);
      if (!m.result) return NextResponse.json({ ok: false, reason: "empty" });
      storeMnemonic(w.id, m.result);
      return NextResponse.json({ ok: true, mnemonic: m.result, source: "model" });
    } catch (e) {
      return NextResponse.json({
        ok: false,
        reason: e instanceof BudgetExceeded ? "budget" : "failed",
      });
    }
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
