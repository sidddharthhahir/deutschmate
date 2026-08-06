/**
 * The video block is reachable, and every unit points at the right episode.
 * needs: seeded database
 */
import { ok, eq, section, done, open } from "./harness.mts";
import { rhythmFor } from "../src/lib/rhythm.ts";

const db = open();

section("a video needs a source, and that is all it needs");
/*
 * This block had never been shown to anybody. 231 Nicos Weg episodes are
 * imported and not one has hand-marked segments, and session.ts required
 * segments before it would offer a video — so `rhythm.input === "video"` was a
 * branch that could not be reached. Reported as "I don't find the youtube
 * video player", which is the only symptom it could ever have produced.
 */
const videos = db
  .prepare("SELECT id, src_url, youtube_id, segments_json FROM video")
  .all() as {
  id: string;
  src_url: string | null;
  youtube_id: string | null;
  segments_json: string;
}[];
ok(videos.length > 100, "the catalogue is seeded", `${videos.length} videos`);

const playable = videos.filter((v) => v.src_url ?? v.youtube_id);
eq(playable.length, videos.length, "every row has something to play");

const segmented = videos.filter((v) => {
  try {
    return (JSON.parse(v.segments_json) as unknown[]).length > 0;
  } catch {
    return false;
  }
});
ok(
  segmented.length < videos.length,
  "and most have no marked-up sentences — which must not hide them",
  `${segmented.length} segmented`,
);

section("the units actually point at an episode");
const linked = db
  .prepare(
    `SELECT u.id, u.level, u.ord, u.title, u.video_id, v.title AS video, v.src_url
       FROM unit u LEFT JOIN video v ON v.id = u.video_id
      WHERE u.video_id IS NOT NULL AND u.level IN ('A1.1','A1.2')
      ORDER BY u.level, u.ord`,
  )
  .all() as {
  id: string;
  ord: number;
  title: string;
  video_id: string;
  video: string | null;
  src_url: string | null;
}[];
ok(linked.length >= 25, "most of A1 has a video", `${linked.length} of 40`);

const dangling = linked.filter((u) => !u.video);
eq(dangling.length, 0, "no unit points at a video row that does not exist");
if (dangling.length)
  console.log(`        ${dangling.map((d) => d.id).join(", ")}`);

const unplayable = linked.filter((u) => !u.src_url);
eq(unplayable.length, 0, "and every linked episode has a file to play");

section("no episode is used by two units");
/* Two units teaching from the same ninety seconds is a mapping mistake, not a
   design. It is how the pre-rewrite links looked once the units moved. */
const byVideo = new Map<string, string[]>();
for (const u of linked)
  byVideo.set(u.video_id, [...(byVideo.get(u.video_id) ?? []), u.id]);
const shared = [...byVideo.entries()].filter(([, us]) => us.length > 1);
eq(shared.length, 0, "each episode belongs to one unit");
if (shared.length)
  console.log(
    `        ${shared.map(([v, us]) => `${v}: ${us.join(" + ")}`).join("; ")}`,
  );

section("the episode matches the unit it was chosen for");
/*
 * Not a semantic check — nothing here can watch the film. These four pairs are
 * the ones the old mapping got demonstrably wrong: the links were assigned
 * against the curriculum the A1 rewrite replaced, so "Zahlen von 1 bis 100" was
 * attached to the unit about "Woher kommst du?" and nobody noticed, because the
 * block never rendered.
 */
const expect: [string, string][] = [
  ["a1-1-u01", "Hallo!"],
  ["a1-1-u02", "Von A bis Z"],
  ["a1-1-u05", "Woher kommst du?"],
  ["a1-2-u11", "Beim Arzt"],
];
for (const [unitId, episode] of expect) {
  const row = linked.find((u) => u.id === unitId);
  ok(
    row?.video?.includes(episode),
    `${unitId} → „${episode}“`,
    row?.video?.replace(/^Nicos Weg A1 · Folge \d+: /, "") ?? "not linked",
  );
}

section("a unit with a video gets one one day in three");
/* The rotation is the reason a video is not every day. Asserted so that making
   the block reachable cannot quietly turn it into the only input block. */
let sawVideo = 0;
for (let d = 0; d < 30; d++)
  if (rhythmFor(d, { video: true, reading: false }).input === "video")
    sawVideo++;
eq(sawVideo, 10, "ten video days in thirty");
let noneWithout = 0;
for (let d = 0; d < 30; d++)
  if (rhythmFor(d, { video: false, reading: true }).input === "video")
    noneWithout++;
eq(noneWithout, 0, "and never for a unit that has none");

db.close();
done();
