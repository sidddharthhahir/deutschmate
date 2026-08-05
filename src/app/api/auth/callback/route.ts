import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  UID_COOKIE,
  createSession,
  redeemSignInToken,
  sweepExpired,
} from "@/lib/auth";
import { userById } from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Following the sign-in link. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  sweepExpired();
  const userId = redeemSignInToken(token);
  const user = userId ? userById(userId) : undefined;

  if (!user) {
    return NextResponse.redirect(new URL("/anmelden?expired=1", url.origin));
  }

  const { value, expiresAt } = createSession(user.id);
  const res = NextResponse.redirect(new URL("/", url.origin));

  /*
   * httpOnly so no script can read it; sameSite=lax so arriving from a mail client or a chat app
   * still carries it; secure only on a real https deployment, because a laptop on plain http would
   * silently drop it.
   */
  const https =
    (req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", ""))
      .split(",")[0]
      .trim()
      .toLowerCase() === "https";

  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    expires: expiresAt,
    path: "/",
  });
  /* Readable on purpose and not a credential — lib/who.ts namespaces
     localStorage per learner and cannot see the httpOnly one. */
  res.cookies.set(UID_COOKIE, user.id, {
    httpOnly: false,
    sameSite: "lax",
    secure: https,
    expires: expiresAt,
    path: "/",
  });
  return res;
}
