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

/**
 * Following the sign-in link.
 *
 * A ROUTE HANDLER, not a page, because only a Route Handler or a Server Action
 * may set a cookie — a page render cannot, and trying produced a 500 on the one
 * screen a new user reaches first.
 *
 * A GET, because the link is followed by clicking it: from a chat message, or
 * later from an email client, with no JavaScript involved.
 *
 * The token is single-use and redeemed inside one UPDATE (see lib/auth.ts), so
 * a mail client that prefetches the link burns it and the learner sees the
 * expired screen rather than someone else being signed in.
 */
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

  /* httpOnly so no script can read it; sameSite=lax so arriving from a mail
     client or a chat app still carries it; secure only when the deployment is
     actually https, or a laptop on plain http would silently drop it. */
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    expires: expiresAt,
    path: "/",
  });
  /* Readable on purpose and not a credential — lib/who.ts namespaces
     localStorage per learner and cannot see the httpOnly one. */
  res.cookies.set(UID_COOKIE, user.id, {
    httpOnly: false,
    sameSite: "lax",
    secure: url.protocol === "https:",
    expires: expiresAt,
    path: "/",
  });
  return res;
}
