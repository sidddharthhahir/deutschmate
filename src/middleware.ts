import { NextResponse, type NextRequest } from "next/server";
/* From who.ts, not auth.ts: this runs in the edge runtime, and auth.ts reaches
   node:sqlite, which does not exist there. who.ts imports nothing. */
import { SESSION_COOKIE } from "@/lib/who";

/**
 * Send signed-out visitors to the sign-in screen.
 *
 * WHY THIS EXISTS RATHER THAN JUST requireUser()
 *
 * Half the app is client components that fetch their data — Home, the session
 * runner, Wortschatz, Nachrichten. `requireUser()` guards the SERVER render,
 * and those pages have almost nothing in theirs. Signed out, Home rendered its
 * shell, fetched `/api/session`, got a 401, and showed "Tagesplan nicht geladen
 * — lokal weiter": a network-problem message for an authentication problem, on
 * the first screen anybody sees.
 *
 * PRESENCE, NOT VALIDITY. This only asks whether a session cookie exists,
 * because middleware cannot reach node:sqlite. That is fine, because it is a
 * ROUTING decision and not a security one — a forged cookie gets you the page
 * shell and then a 401 from every route behind it, exactly as before. The real
 * check stays server-side in `userIdForSession`.
 *
 * /api is deliberately NOT matched. A route must answer 401 rather than
 * redirect: a fetch follows redirects silently, and the caller would parse the
 * sign-in page's HTML as its JSON result.
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
   * Everything except: the sign-in screen itself, the auth endpoint behind it,
   * every other API route (they 401), and static files. `_next/image` and the
   * audio directory matter — 2,381 recordings that must not each become a
   * redirect.
   */
  matcher: ["/((?!anmelden|api/|_next/static|_next/image|audio/|icons/|favicon|manifest|sw.js).*)"],
};
