import { NextResponse, type NextRequest } from "next/server";
/* From who.ts, not auth.ts: this runs in the edge runtime, and auth.ts reaches
   node:sqlite, which does not exist there. who.ts imports nothing. */
import { SESSION_COOKIE } from "@/lib/who";

/**
 * Send signed-out visitors to the sign-in screen. This only asks whether a session cookie exists,
 * because middleware cannot reach node:sqlite.
 */
export function middleware(req: NextRequest) {
  if (req.cookies.get(SESSION_COOKIE)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/anmelden";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  /*
   * Everything except: the sign-in screen itself, the auth endpoint behind it, every other API
   * route (they 401), and static files.
   */
  matcher: [
    "/((?!anmelden|api/|_next/static|_next/image|audio/|icons/|favicon|manifest|sw.js).*)",
  ],
};
