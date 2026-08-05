import { NextResponse } from "next/server";
import { all, get, run } from "@/lib/db";
import { adminEnabled } from "@/lib/trust";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Segment = { t_start: number; t_end: number; de: string; en: string };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const v = get("SELECT * FROM video WHERE id = ?", id);
    return NextResponse.json({ video: v ?? null });
  }

  const videos = all<{
    id: string;
    youtube_id: string;
    title: string;
    level: string;
    channel: string | null;
    unit_id: string | null;
    segments_json: string;
  }>("SELECT * FROM video ORDER BY level, title");

  const units = all<{ id: string; ord: number; title: string; level: string }>(
    "SELECT id, ord, title, level FROM unit ORDER BY level, ord",
  );

  return NextResponse.json({
    videos: videos.map((v) => ({
      ...v,
      segments: JSON.parse(v.segments_json) as Segment[],
    })),
    units,
    /* So the editor can say up front that it cannot save. Reading the list is
       harmless and stays open; the POST below is the thing that is gated, and
       finding that out only after hand-marking a video is the worst moment. */
    canWrite: adminEnabled(),
  });
}

/**
 * Save a video and its hand-marked segments.
 *
 * OPERATOR ONLY, and it was not.
 *
 * This route had no user resolution and no check of any kind, and line 83 runs
 * `UPDATE unit SET video_id = ? WHERE id = ?` — a write to the *shared content*
 * every learner reads. Anyone who could reach the server could rewrite the
 * curriculum, anonymously, with one curl.
 *
 * It is a tool for whoever has the repo checked out, so it gets an operator
 * switch: `DEUTSCHMATE_ADMIN=1`, off unless deliberately set. That is a switch
 * and not a password, and lib/trust.ts says so plainly rather than implying a
 * safety it does not have — it stops the accidental and the drive-by, and is no
 * defence against someone who can already set your environment.
 */
export async function POST(req: Request) {
  if (!adminEnabled()) {
    return NextResponse.json(
      { error: "admin tools are off — set DEUTSCHMATE_ADMIN=1 to enable them" },
      { status: 403 },
    );
  }

  const body = (await req.json()) as {
    id?: string;
    youtubeId?: string;
    srcUrl?: string | null;
    title: string;
    level: string;
    channel?: string;
    unitId?: string | null;
    segments: Segment[];
  };

  /* Either source is fine, but one of them has to be there — a row with
     neither is a title with nothing behind it, which renders as an empty
     black box inside a lesson. */
  const src = (body.srcUrl ?? "").trim();
  if (src && !/^https:\/\/\S+$/i.test(src)) {
    return NextResponse.json({ error: "srcUrl must be an https url" }, { status: 400 });
  }
  if ((!body.youtubeId && !src) || !body.title) {
    return NextResponse.json(
      { error: "a youtubeId or srcUrl, plus a title, are required" },
      { status: 400 },
    );
  }

  /* Same id shape the seeder uses, so marking up a DW episode by hand updates
     that row rather than creating a second one beside it. */
  const id =
    body.id ||
    (src ? `dw-${src.split("/").pop()!.replace(/\.mp4$/i, "")}` : `yt-${body.youtubeId}`);
  const clean = (body.segments ?? [])
    .filter((s) => s.de?.trim() && s.t_end > s.t_start)
    .sort((a, b) => a.t_start - b.t_start)
    .map((s) => ({
      t_start: Math.round(s.t_start * 10) / 10,
      t_end: Math.round(s.t_end * 10) / 10,
      de: s.de.trim(),
      en: (s.en ?? "").trim(),
    }));

  run(
    `INSERT INTO video (id, youtube_id, src_url, title, level, channel, unit_id, segments_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       youtube_id=excluded.youtube_id, src_url=excluded.src_url,
       title=excluded.title, level=excluded.level,
       channel=excluded.channel, unit_id=excluded.unit_id, segments_json=excluded.segments_json`,
    id,
    body.youtubeId ?? "",
    src || null,
    body.title,
    body.level,
    body.channel ?? null,
    body.unitId ?? null,
    JSON.stringify(clean),
  );

  if (body.unitId) run("UPDATE unit SET video_id = ? WHERE id = ?", id, body.unitId);

  return NextResponse.json({ ok: true, id, segments: clean.length });
}
