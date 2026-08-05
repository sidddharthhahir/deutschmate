import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 1800;

/** Langsam gesprochene Nachrichten — real German news, read slowly, daily. */

const FEED = "https://rss.dw.com/xml/DKpodcast_lgn_de";
const UA = "DeutschMate/1.0 (personal language-learning app)";

export type Episode = {
  title: string;
  date: string;
  link: string;
  audio: string | null;
  seconds: number | null;
};

/** Pull the first capture of the first pattern that matches. */
function pick(xml: string, ...patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = xml.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** "HH:MM:SS" or plain seconds → seconds. */
function duration(raw: string | null): number | null {
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const parts = raw.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export async function GET() {
  try {
    const res = await fetch(FEED, {
      headers: { "User-Agent": UA },
      // Half an hour is plenty for a feed that updates once a day, and it
      // keeps DW's servers out of the request path for every page view.
      next: { revalidate: 1800 },
    });
    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        reason: `feed ${res.status}`,
        episodes: [],
      });
    }

    const xml = await res.text();
    const items = xml.split(/<item[\s>]/).slice(1, 15);

    const episodes: Episode[] = items.map((raw) => {
      const audio = pick(raw, /<enclosure[^>]*url="([^"]+)"/i);
      return {
        title: decode(
          pick(raw, /<title>([\s\S]*?)<\/title>/i) ?? "Nachrichten",
        ),
        date: decode(pick(raw, /<pubDate>([\s\S]*?)<\/pubDate>/i) ?? ""),
        link: decode(pick(raw, /<link>([\s\S]*?)<\/link>/i) ?? ""),
        audio: audio ? decode(audio) : null,
        seconds: duration(
          pick(raw, /<itunes:duration>([\s\S]*?)<\/itunes:duration>/i),
        ),
      };
    });

    return NextResponse.json({
      ok: true,
      source: "Deutsche Welle · Langsam gesprochene Nachrichten",
      episodes: episodes.filter((e) => e.audio),
    });
  } catch {
    // Offline is the normal case here, not an error worth shouting about.
    return NextResponse.json({ ok: false, reason: "offline", episodes: [] });
  }
}
