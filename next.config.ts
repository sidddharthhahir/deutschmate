import type { NextConfig } from "next";

/** Hosts allowed to load dev resources (HMR, /_next/*). */
const DEV_ORIGINS = [
  "localhost",
  "127.0.0.1",
  "100.64.0.0/10", // Tailscale / CGNAT — covers any tailnet address
  "192.168.0.0/16", // home LAN
  "172.16.0.0/12",
  "10.0.0.0/8",
];

/*
 * Security headers, kept deliberately minimal — see SECURITY_AUDIT_REPORT.md
 * §"Security headers" for what was checked before adding these and why a
 * full Content-Security-Policy is NOT here yet.
 *
 * Every one of these is additive and safe: none of them change how the app
 * behaves, only how a browser is allowed to treat it.
 *
 * NOT included, deliberately:
 *   - Content-Security-Policy: Next.js hydration relies on inline scripts
 *     (`self.__next_f.push(...)`); a script-src strict enough to matter
 *     would need per-request nonces threaded through src/proxy.ts and the
 *     root layout, which is a real change that needs its own testing, not
 *     something to bolt on inside a security-audit pass. Documented as an
 *     open item before public launch.
 *   - Strict-Transport-Security: dangerous to set unconditionally on an app
 *     that a pilot may still reach over plain HTTP (LAN, Tailscale, a
 *     reverse proxy not yet configured for TLS) — HSTS is sticky in the
 *     browser and would lock those out. Belongs at the reverse-proxy layer,
 *     only once HTTPS is confirmed for every path to the server.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  /* Only microphone is used (Speaking blocks, via the Web Speech API) — and
     only same-origin. Camera and geolocation are never requested anywhere
     in this app, so they are switched off rather than left to their
     (permissive) default. */
  {
    key: "Permissions-Policy",
    value: "microphone=(self), camera=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: DEV_ORIGINS,
  async headers() {
    return [
      {
        // Every route: clickjacking/MIME-sniffing protection applies everywhere.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        // API responses carry per-user progress, cards, and settings — none
        // of it should sit in a shared cache or a browser's back/forward
        // cache.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
