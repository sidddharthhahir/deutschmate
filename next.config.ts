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

const nextConfig: NextConfig = {
  allowedDevOrigins: DEV_ORIGINS,
};

export default nextConfig;
