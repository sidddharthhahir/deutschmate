import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import CommandPalette from "@/components/CommandPalette";
import ShortcutHelp from "@/components/ShortcutHelp";
import ServiceWorker from "@/components/ServiceWorker";
import "./globals.css";

/**
 * Three typefaces, three jobs (from the Seminar design system): Source Serif 4 — German text,
 * headings, word cards.
 */
const serif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin", "latin-ext"], // latin-ext carries ä ö ü ß
  weight: ["400", "600"],
  display: "swap",
});

const sans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DeutschMate",
  description:
    "Learn German the way you'll actually use it in Germany. A1.1 → B1.2, one hour a day.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "DeutschMate",
    statusBarStyle: "black-translucent",
  },
};

/**
 * viewportFit: "cover" plus the safe-area padding in globals.css keeps the
 * grade buttons clear of the iPhone home indicator — they sit at the very
 * bottom of the screen, which is exactly where that bar lives.
 */
export const viewport: Viewport = {
  themeColor: "#0e1715",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="de"
      className={`${serif.variable} ${sans.variable} ${mono.variable} h-full`}
    >
      <body className="bg-bg text-fg min-h-full">
        {children}
        {/* Global chrome: reachable from every screen, visible on none. */}
        <CommandPalette />
        <ShortcutHelp />
        <ServiceWorker />
      </body>
    </html>
  );
}
