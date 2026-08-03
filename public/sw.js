/* DeutschMate service worker.
 *
 * Purpose: make the app open at all when there is no network. Without one,
 * "offline-first" stopped at the blocks — the shell itself needed a server, so
 * a tram tunnel produced a browser error page rather than a session.
 *
 * What is deliberately NOT cached: /api/. Serving a stale session plan or an
 * old due count from cache would show yesterday's numbers as today's, and the
 * app is not allowed to present a number that isn't current (principle 4).
 * Pages fall back to cache; their DATA has to come from the server or be
 * honestly reported as missing.
 */

const VERSION = "dm-v2";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

/**
 * Only these navigations are cached.
 *
 * The first version cached every page it saw, which quietly broke the rule the
 * whole app is built on. /fortschritt, /woche and /problemwoerter are rendered
 * on the server from live counts; serving yesterday's HTML for them offline
 * shows stale numbers with no indication that they're stale — a page confidently
 * reporting a streak and a word count that are no longer true.
 *
 * These four are the shell: markup whose content comes from a later fetch, or
 * from data that doesn't change. Everything else gets offline.html, which says
 * plainly that it can't show you real numbers right now.
 */
const SHELL_ROUTES = ["/", "/session", "/wortschatz", "/ueben"];

const PRECACHE = [
  ...SHELL_ROUTES,
  "/offline.html",
  "/manifest.webmanifest",
  "/icon.svg",
];

/** Is this a page we're willing to serve from cache? */
function isShell(url) {
  return SHELL_ROUTES.includes(url.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // Individually, so one 404 cannot fail the whole install.
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Immutable build output and audio: cache-first, they never change in place. */
function cacheFirst(request, cacheName) {
  return caches.match(request).then(
    (hit) =>
      hit ||
      fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(cacheName).then((c) => c.put(request, copy));
        }
        return res;
      }),
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache data. Stale progress is worse than absent progress.
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/audio/")) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Network wins always. Only shell pages are worth keeping a copy of.
          if (res.ok && isShell(url)) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          if (isShell(url)) {
            const hit = await caches.match(request);
            if (hit) return hit;
          }
          // A data page offline gets an honest page, never stale counts.
          return (
            (await caches.match("/offline.html")) ??
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        }),
    );
  }
});
