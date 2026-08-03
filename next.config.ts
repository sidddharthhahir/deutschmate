import type { NextConfig } from "next";

/**
 * Hosts allowed to load dev resources (HMR, /_next/*).
 *
 * Next blocks cross-origin dev requests by default, which is right — but it
 * also blocks the phone. Reaching the dev server from another device means the
 * browser's origin is a LAN or tailnet address, not "localhost", and without
 * these entries hot reload silently stops working while pages still render.
 *
 * These are private ranges only. Nothing here is reachable from the internet,
 * and none of it applies to a production build.
 */
const DEV_ORIGINS = [
  "localhost",
  "127.0.0.1",
  "100.126.169.69", // this machine on the tailnet
  "100.64.0.0/10", // Tailscale / CGNAT
  "192.168.0.0/16", // home LAN
  "10.0.0.0/8",
];

const nextConfig: NextConfig = {
  allowedDevOrigins: DEV_ORIGINS,
};

export default nextConfig;
