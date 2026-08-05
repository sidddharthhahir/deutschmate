/**
 * Load the curated video list, verifying every id against YouTube first.
 *
 *   npm run videos                          verify and seed data/videos.json
 *   npm run videos -- --check               verify only, write nothing
 *   npm run videos -- --from-playlist <ID>  append new ids from a DW playlist
 *
 * WHY VERIFY AT ALL. A YouTube id is a string that looks fine forever. The
 * video behind it gets deleted, made private, or has embedding turned off, and
 * the only symptom in the app is a grey box inside a lesson — no error, no log,
 * and it looks like the app is broken rather than the video being gone. oEmbed
 * answers all three questions in one request, needs no API key, and is not
 * behind the consent wall that makes playlist pages unreadable from an EU IP.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not write segments. A segment is
 * a timestamp and a line of German that has to match what is actually said, and
 * the only way to know that is to listen. Inventing them would put subtitles
 * over a video that disagree with it — worse than having no video, because a
 * learner would believe them. `session.ts` will not offer a video until it has
 * segments, so everything seeded here stays invisible to learners until a human
 * has been through /admin/video.
 */
import "./load-env.mts";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDb, run, get, all } from "../src/lib/db.ts";

type Entry = {
  youtube_id: string;
  title: string;
  level: string;
  unit_id?: string;
  why?: string;
};
type File = { videos: Entry[]; source?: { playlists?: string[] } } & Record<string, unknown>;

const FILE = path.join(process.cwd(), "data", "videos.json");
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const amber = (s: string) => `\x1b[33m${s}\x1b[0m`;

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const playlistFlag = args.indexOf("--from-playlist");
const playlist = playlistFlag >= 0 ? args[playlistFlag + 1] : null;

const data = JSON.parse(readFileSync(FILE, "utf8")) as File;

// ------------------------------------------------------- pull from a playlist
/**
 * YouTube's per-playlist RSS. Not the playlist page: that 302s to a consent
 * banner from an EU address, and clicking through one on somebody's behalf is
 * not something a seeding script should do. The feed is capped at the newest 15
 * entries, which is a real limit on how much of a 76-episode course this can
 * reach in one go — say so rather than silently returning a short list.
 */
async function fromPlaylist(id: string) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${id}`);
  if (!res.ok) {
    console.error(`\n  ${red("✗")} playlist ${id}: HTTP ${res.status}\n`);
    process.exit(1);
  }
  const xml = await res.text();
  const ids = [...xml.matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g)].map((m) => m[1]);
  const titles = [...xml.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]).slice(1);

  const known = new Set(data.videos.map((v) => v.youtube_id));
  const fresh = ids
    .map((v, i) => ({ youtube_id: v, title: decode(titles[i] ?? v), level: "A1.1" }))
    .filter((v) => !known.has(v.youtube_id));

  console.log(`\n  playlist ${id}: ${ids.length} entries, ${fresh.length} new`);
  if (ids.length === 15) {
    console.log(dim("  (15 is the feed's cap — there may be more in the playlist)"));
  }
  if (!fresh.length) return;

  data.videos.push(...fresh);
  writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(
    `  ${green("✓")} appended to data/videos.json with level A1.1 — ${amber("set the level and unit_id by hand")}\n`,
  );
  for (const v of fresh) console.log(`      ${v.youtube_id}  ${v.title}`);
}

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

if (playlist) {
  await fromPlaylist(playlist);
  process.exit(0);
}

// ------------------------------------------------------------------- verify
console.log(`\n  Verifying ${data.videos.length} videos against YouTube…\n`);

const ok: Entry[] = [];
let bad = 0;

for (const v of data.videos) {
  const url = `https://www.youtube.com/oembed?url=https%3A//www.youtube.com/watch%3Fv%3D${v.youtube_id}&format=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      /* 404 = gone, 401 = embedding disabled. Both mean the same thing for us:
         it cannot be shown in a lesson, so it must not be seeded as if it can. */
      console.log(
        `  ${red("✗")} ${v.youtube_id}  ${res.status === 401 ? "embedding disabled" : "not found"}  ${dim(v.title)}`,
      );
      bad++;
      continue;
    }
    const meta = (await res.json()) as { title: string; author_name: string };
    ok.push(v);
    console.log(`  ${green("✓")} ${v.youtube_id}  ${v.level.padEnd(5)} ${dim(meta.author_name)}`);
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
if (!ok.length) {
  console.error(`  ${red("Nothing to seed.")}\n`);
  process.exit(1);
}

// --------------------------------------------------------------------- seed
getDb();
let inserted = 0;
let updated = 0;
let linked = 0;

for (const v of ok) {
  const existing = get<{ id: string; segments_json: string }>(
    "SELECT id, segments_json FROM video WHERE youtube_id = ?",
    v.youtube_id,
  );
  if (existing) {
    /* Never touch segments_json. Somebody's twelve minutes of hand-marking
       lives in that column, and re-running a seed script must not be a way to
       lose it. */
    run(
      "UPDATE video SET title = ?, level = ?, channel = ?, unit_id = ? WHERE id = ?",
      v.title,
      v.level,
      "Deutsche Welle",
      v.unit_id ?? null,
      existing.id,
    );
    updated++;
  } else {
    run(
      `INSERT INTO video (id, youtube_id, title, level, channel, unit_id, segments_json)
       VALUES (?, ?, ?, ?, 'Deutsche Welle', ?, '[]')`,
      `dw-${v.youtube_id}`,
      v.youtube_id,
      v.title,
      v.level,
      v.unit_id ?? null,
    );
    inserted++;
  }

  /* The unit points back at the video, which is what the session builder
     reads. Only for an explicit mapping — and only when the unit exists, so a
     typo in the JSON is a warning rather than a dangling reference. */
  if (v.unit_id) {
    const unit = get<{ id: string }>("SELECT id FROM unit WHERE id = ?", v.unit_id);
    if (!unit) {
      console.log(`  ${amber("!")} no unit "${v.unit_id}" — ${v.youtube_id} left unlinked`);
    } else {
      run("UPDATE unit SET video_id = ? WHERE id = ?", `dw-${v.youtube_id}`, v.unit_id);
      linked++;
    }
  }
}

const segmented = all<{ n: number }>(
  "SELECT COUNT(*) AS n FROM video WHERE segments_json != '[]' AND segments_json != ''",
)[0].n;
const units = all<{ n: number }>("SELECT COUNT(*) AS n FROM unit")[0].n;

console.log(
  `\n  ${green("✓")} ${inserted} added, ${updated} updated, ${linked} linked to a unit\n`,
);
console.log(`  ${segmented} of ${ok.length} have segments.`);
console.log(
  dim(
    segmented === 0
      ? `  None yet — so the video block still never appears, which is correct:\n` +
          `  an unsegmented embed is a YouTube link, not a lesson. Mark them up at\n` +
          `  /admin/video (DEUTSCHMATE_ADMIN=1), about ten minutes each.`
      : `  ${units - segmented} units still have no segmented video.`,
  ),
);
console.log();
