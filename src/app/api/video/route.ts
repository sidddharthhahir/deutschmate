import { NextResponse } from "next/server";
import { all, get, run } from "@/lib/db";

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
  });
}

/** Save a video and its hand-marked segments. */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    id?: string;
    youtubeId: string;
    title: string;
    level: string;
    channel?: string;
    unitId?: string | null;
    segments: Segment[];
  };

  if (!body.youtubeId || !body.title) {
    return NextResponse.json({ error: "youtubeId and title required" }, { status: 400 });
  }

  const id = body.id || `v-${body.youtubeId}`;
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
    `INSERT INTO video (id, youtube_id, title, level, channel, unit_id, segments_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       youtube_id=excluded.youtube_id, title=excluded.title, level=excluded.level,
       channel=excluded.channel, unit_id=excluded.unit_id, segments_json=excluded.segments_json`,
    id,
    body.youtubeId,
    body.title,
    body.level,
    body.channel ?? null,
    body.unitId ?? null,
    JSON.stringify(clean),
  );

  if (body.unitId) run("UPDATE unit SET video_id = ? WHERE id = ?", id, body.unitId);

  return NextResponse.json({ ok: true, id, segments: clean.length });
}
