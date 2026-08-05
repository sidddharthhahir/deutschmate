import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { activeUser } from "@/lib/user";
import { readJson, badRequest, unauthorized, str } from "@/lib/http";
import {
  clearApiKey,
  keyState,
  looksLikeKey,
  setApiKey,
  setBudget,
} from "@/lib/apikey";
import { secretsAvailable } from "@/lib/secrets";
import { contributions, forgetContributions } from "@/lib/shared-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The learner's own API key, and their own spend cap. THE KEY IS NEVER RETURNED. */
export async function POST(req: Request) {
  const raw = await readJson(req);
  const user = await activeUser(req, raw);
  if (!user) return unauthorized();

  const action = str(raw.action, 20);

  // ------------------------------------------------------------ the key
  if (action === "key") {
    if (!secretsAvailable()) {
      return badRequest(
        "this server has no DEUTSCHMATE_SECRET, so it will not store a key — run `npm run setup`",
      );
    }
    const key = str(raw.key, 300);
    if (!looksLikeKey(key)) {
      return badRequest(
        "that does not look like an Anthropic key (they start sk-ant-…)",
      );
    }

    /* Verified before it is stored, with a call that costs nothing: listing
       models needs a valid credential and spends no tokens. A key that is
       merely the right SHAPE fails silently at the worst moment — mid-session,
       looking like the app is broken. */
    let verified = false;
    let why = "";
    try {
      await new Anthropic({ apiKey: key }).models.list({ limit: 1 });
      verified = true;
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 401 || status === 403) {
        return badRequest(
          "Anthropic rejected that key — check it was copied whole",
        );
      }
      /* Anything else is this server's problem, not the key's: no network, a
         rate limit, an outage. Store it and say it could not be checked, which
         is true, rather than refusing a key that is probably fine. */
      why = e instanceof Error ? e.message : "could not reach Anthropic";
    }

    if (!setApiKey(user.id, key)) return badRequest("could not store that key");
    return NextResponse.json({
      ok: true,
      verified,
      why,
      key: keyState(user.id),
    });
  }

  if (action === "key:remove") {
    clearApiKey(user.id);
    return NextResponse.json({ ok: true, key: keyState(user.id) });
  }

  // --------------------------------------------------------- the ceiling
  if (action === "budget") {
    /* null clears it, which means "use whatever this deployment defaults to".
       Zero is NOT null: it is a deliberate "spend nothing", and conflating the
       two would silently turn the brake off. */
    const value = raw.budget;
    if (value === null || value === "") {
      setBudget(user.id, null);
      return NextResponse.json({ ok: true });
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 1000) {
      return badRequest(
        "a budget between 0 and 1000 dollars, or empty for the default",
      );
    }
    setBudget(user.id, n);
    return NextResponse.json({ ok: true });
  }

  // ------------------------------------------------------- the cache
  /* Taking your text back out. */
  if (action === "cache:forget") {
    const scope = str(raw.scope, 10) === "all" ? "all" : "private";
    const removed = forgetContributions(user.id, scope);
    return NextResponse.json({
      ok: true,
      removed,
      cache: contributions(user.id),
    });
  }

  return badRequest("unknown action");
}
