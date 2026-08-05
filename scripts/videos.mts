/**
 * Build the video catalogue, then seed it.
 *
 *   npm run videos                 verify data/videos.json and seed it
 *   npm run videos -- --check      verify only, write nothing
 *   npm run videos -- --refresh    re-pull every DW feed, rewrite the catalogue
 *   npm run videos -- --prune      also drop db rows the catalogue dropped,
 *                                  but only those with no segments
 *
 * WHERE THE VIDEOS COME FROM
 *
 * Deutsche Welle's "Nicos Weg" — a free A1–B1 drama course from a public
 * broadcaster, already cut into ~90-second lesson-sized episodes.
 *
 * DW publishes the whole thing as three official video podcasts: 226 episodes
 * with direct mp4s on their own CDN, episode and unit numbers encoded in the
 * filenames, and durations. That is the source. The YouTube route reached 14 of
 * them, because playlist pages 302 to a consent banner and the RSS feeds return
 * only the newest 15 entries — a handful of extras that are not in the podcasts
 * (the full-length films, the recaps) stay on YouTube and are kept by hand.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not write segments. A segment is a timestamp plus the line actually
 * spoken, and the only way to know the line is to listen. Invented ones would
 * be subtitles that disagree with the video — worse than no video, because a
 * learner would believe them. `session.ts` will not offer a video until it has
 * segments, so everything seeded here stays invisible until a person has been
 * through /admin/video.
 *
 * It also does not guess unit_id. The DW "Einheit" in the filename is DW's
 * course structure, not this app's 20-units-per-level one, and mapping 226
 * episodes onto 120 units by arithmetic would put the wrong video in a lesson
 * silently. Level is set, which is what the editor sorts by; the unit is picked
 * while watching, which is when you are segmenting it anyway.
 */
import "./load-env.mts";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDb, run, get, all } from "../src/lib/db.ts";

type Entry = {
  /** Direct mp4 (DW) — takes precedence over youtube_id. */
  src_url?: string;
  youtube_id?: string;
  title: string;
  level: string;
  duration?: number;
  unit_id?: string;
  why?: string;
};
type Catalogue = { videos: Entry[] } & Record<string, unknown>;

const FILE = path.join(process.cwd(), "data", "videos.json");
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const refresh = args.includes("--refresh");
const prune = args.includes("--prune");

const data = JSON.parse(readFileSync(FILE, "utf8")) as Catalogue;

/* DW's own podcast feeds. Note A1/A2 are under /xmlhd and B1 under /xml with a
   different word order — guessed names return HTTP 200 with an empty body, so
   a feed is validated by episode count, never by status. */
const FEEDS: { level: string; url: string; label: string }[] = [
  { level: "A1", url: "https://rss.dw.com/xmlhd/DKpodcast_nicosweg_A1_videos_en", label: "A1" },
  { level: "A2", url: "https://rss.dw.com/xmlhd/DKpodcast_nicosweg_A2_videos_en", label: "A2" },
  { level: "B1", url: "https://rss.dw.com/xml/DKpodcast_nicosweg_video_B1_de", label: "B1" },
];

const seconds = (hms?: string) =>
  hms
    ? hms
        .split(":")
        .map(Number)
        .reduce((acc, n) => acc * 60 + n, 0)
    : undefined;

const text = (block: string, tag: string) =>
  block
    .match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`))?.[1]
    ?.trim();

/**
 * DW's course splits into ~19 "Einheiten" per level; this app has 20 units per
 * half-level. First half of the Einheiten to the .1, second half to the .2.
 * A coarse bucket for sorting the editor's queue — deliberately NOT a claim
 * about which unit an episode belongs to.
 */
const halfLevel = (base: string, einheit: number) => `${base}.${einheit <= 9 ? 1 : 2}`;

async function pullFeeds(): Promise<Entry[]> {
  const out: Entry[] = [];
  for (const f of FEEDS) {
    const res = await fetch(f.url, { headers: { "User-Agent": "DeutschMate/1.0" } });
    if (!res.ok) {
      console.log(`  ${red("✗")} ${f.label}: HTTP ${res.status}`);
      continue;
    }
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    let kept = 0;
    for (const it of items) {
      const src = it.match(/<enclosure[^>]*url="([^"]+)"/)?.[1];
      if (!src) continue;
      const folge = Number(src.match(/_F(\d+)/)?.[1] ?? 0);
      const einheit = Number(src.match(/_E(\d+)/)?.[1] ?? 0);
      if (!folge) continue; // trailers and stingers carry no episode number
      out.push({
        src_url: src,
        title: `Nicos Weg ${f.label} · Folge ${folge}: ${text(it, "title") ?? "—"}`,
        level: halfLevel(f.label, einheit),
        duration: seconds(text(it, "itunes:duration")),
      });
      kept++;
    }
    console.log(`  ${green("✓")} ${f.label}: ${kept} episodes from ${items.length} items`);
  }
  return out;
}

// ------------------------------------------------------------------ refresh
if (refresh) {
  console.log("\n  Pulling Deutsche Welle's Nicos Weg podcast feeds…\n");
  const pulled = await pullFeeds();
  if (!pulled.length) {
    console.error(`\n  ${red("Nothing pulled — catalogue left alone.")}\n`);
    process.exit(1);
  }

  /* Hand-made entries survive a refresh: the YouTube extras, and any unit_id
     somebody assigned. Keyed by src_url so a re-pull updates in place. */
  const byUrl = new Map(pulled.map((v) => [v.src_url!, v]));
  const keptManual = data.videos.filter((v) => !v.src_url);
  for (const old of data.videos) {
    const fresh = old.src_url ? byUrl.get(old.src_url) : undefined;
    if (fresh && old.unit_id) fresh.unit_id = old.unit_id;
    if (fresh && old.why) fresh.why = old.why;
  }

  data.videos = [...pulled, ...keptManual];
  writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(
    `\n  ${green("✓")} ${pulled.length} from DW + ${keptManual.length} kept by hand → data/videos.json\n`,
  );
}

// ------------------------------------------------------------------- verify
const entries = (JSON.parse(readFileSync(FILE, "utf8")) as Catalogue).videos;
const files = entries.filter((v) => v.src_url);
const tube = entries.filter((v) => !v.src_url && v.youtube_id);

console.log(`  Verifying ${files.length} DW files and ${tube.length} YouTube embeds…\n`);

const ok: Entry[] = [];
let bad = 0;

/* Sample rather than HEAD all 226: they are one CDN, one path shape, and 226
   round trips to prove that is noise. A broken CDN shows up in the sample; a
   single dead episode shows up when somebody opens it. Every URL is still
   checked for shape. */
const sample = files.filter((_, i) => i % 40 === 0).slice(0, 6);
for (const v of sample) {
  try {
    const r = await fetch(v.src_url!, { method: "HEAD", signal: AbortSignal.timeout(15_000) });
    const type = r.headers.get("content-type") ?? "";
    const ranges = r.headers.get("accept-ranges");
    console.log(
      `  ${r.ok && type.startsWith("video/") ? green("✓") : red("✗")} ${r.status} ${type} ${ranges === "bytes" ? "seekable" : dim("no range support")}  ${dim(v.title.slice(0, 44))}`,
    );
    if (!r.ok || !type.startsWith("video/")) bad++;
  } catch (e) {
    console.log(`  ${red("✗")} ${(e as Error).message}  ${v.title.slice(0, 44)}`);
    bad++;
  }
}
for (const v of files) {
  if (/^https:\/\/[\w.-]+\/\S+\.mp4$/.test(v.src_url!)) ok.push(v);
  else {
    console.log(`  ${red("✗")} not an https mp4 url: ${v.src_url}`);
    bad++;
  }
}

/* YouTube ids get the full check: oEmbed answers exists / embeddable / real
   title in one request, needs no key, and is not behind the consent wall. */
for (const v of tube) {
  const url = `https://www.youtube.com/oembed?url=https%3A//www.youtube.com/watch%3Fv%3D${v.youtube_id}&format=json`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) {
      console.log(
        `  ${red("✗")} ${v.youtube_id}  ${r.status === 401 ? "embedding disabled" : "not found"}`,
      );
      bad++;
      continue;
    }
    await r.json();
    ok.push(v);
    console.log(`  ${green("✓")} ${v.youtube_id}  ${dim(v.title.slice(0, 48))}`);
  } catch (e) {
    console.log(`  ${red("✗")} ${v.youtube_id}  ${(e as Error).message}`);
    bad++;
  }
}

console.log(`\n  ${ok.length} playable, ${bad} unusable`);
if (checkOnly) {
  console.log();
  process.exit(bad ? 1 : 0);
}

// --------------------------------------------------------------------- seed
const idOf = (v: Entry) =>
  v.src_url ? `dw-${v.src_url.split("/").pop()!.replace(/\.mp4$/, "")}` : `yt-${v.youtube_id}`;

getDb();
let inserted = 0;
let updated = 0;
let linked = 0;

for (const v of ok) {
  const id = idOf(v);
  const existing = get<{ id: string }>("SELECT id FROM video WHERE id = ?", id);
  if (existing) {
    // segments_json untouched: somebody's hand-marking lives there.
    run(
      "UPDATE video SET youtube_id=?, src_url=?, duration=?, title=?, level=?, channel=?, unit_id=? WHERE id=?",
      v.youtube_id ?? "",
      v.src_url ?? null,
      v.duration ?? null,
      v.title,
      v.level,
      "Deutsche Welle",
      v.unit_id ?? null,
      id,
    );
    updated++;
  } else {
    run(
      `INSERT INTO video (id, youtube_id, src_url, duration, title, level, channel, unit_id, segments_json)
       VALUES (?, ?, ?, ?, ?, ?, 'Deutsche Welle', ?, '[]')`,
      id,
      v.youtube_id ?? "",
      v.src_url ?? null,
      v.duration ?? null,
      v.title,
      v.level,
      v.unit_id ?? null,
    );
    inserted++;
  }
  if (v.unit_id) {
    if (get<{ id: string }>("SELECT id FROM unit WHERE id = ?", v.unit_id)) {
      run("UPDATE unit SET video_id = ? WHERE id = ?", id, v.unit_id);
      linked++;
    } else {
      console.log(`  ! no unit "${v.unit_id}" — ${id} left unlinked`);
    }
  }
}

/*
 * Rows from an earlier import that the catalogue no longer lists.
 *
 * Never deleted by default: one of them may be the video somebody spent twelve
 * minutes marking up, and a seed script is not the place to make that call.
 * `--prune` removes only the ones with NO segments, which is safe by
 * construction — the thing worth protecting is precisely what it checks for.
 */
const stale = all<{ id: string; title: string; n: number }>(
  `SELECT id, title, length(segments_json) AS n FROM video
    WHERE id NOT IN (${ok.map(() => "?").join(",")})`,
  ...ok.map(idOf),
);

if (prune) {
  const empty = stale.filter((s) => s.n <= 2);
  for (const s of empty) {
    run("UPDATE unit SET video_id = NULL WHERE video_id = ?", s.id);
    run("DELETE FROM video WHERE id = ?", s.id);
  }
  const kept = stale.length - empty.length;
  console.log(
    `\n  pruned ${empty.length} unsegmented orphan(s)` +
      (kept ? `; ${red(`kept ${kept} that HAVE segments`)} — delete those by hand if you mean it` : ""),
  );
  stale.length = 0;
}

const segmented = all<{ n: number }>(
  "SELECT COUNT(*) AS n FROM video WHERE segments_json NOT IN ('[]','')",
)[0].n;

console.log(`\n  ${green("✓")} ${inserted} added, ${updated} updated, ${linked} linked to a unit`);
if (stale.length) {
  console.log(`\n  ${stale.length} row(s) no longer in the catalogue, left in place:`);
  for (const s of stale.slice(0, 8)) {
    console.log(`      ${s.id}  ${s.n > 2 ? "HAS SEGMENTS" : "empty"}  ${dim(s.title.slice(0, 40))}`);
  }
}
console.log(`\n  ${segmented} videos have segments.`);
console.log(
  dim(
    segmented === 0
      ? "  None yet, so the video block still never appears — correct, since an\n" +
          "  unsegmented video is a file, not a lesson. Mark them up at /admin/video\n" +
          "  with DEUTSCHMATE_ADMIN=1, about ten minutes each."
      : "  Those are the only ones a session can use.",
  ),
);
console.log();
