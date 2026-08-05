/**
 * Move content made at runtime out of the database and into `data/`, so it is committed rather
 * than living on one laptop. npm run export-content WHY THIS EXISTS Almost everything the app
 * knows comes from `data/` and is rebuilt by `npm run seed`.
 */
import "./load-env.mts";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { all } from "../src/lib/db.ts";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

type Segment = { t_start: number; t_end: number; de: string; en: string };
type Entry = {
  src_url?: string;
  youtube_id?: string;
  title: string;
  level: string;
  duration?: number;
  unit_id?: string;
  why?: string;
  segments?: Segment[];
};

let wrote = 0;

// ------------------------------------------------------------------ videos
const VIDEOS = path.join(process.cwd(), "data", "videos.json");
const catalogue = JSON.parse(readFileSync(VIDEOS, "utf8")) as {
  videos: Entry[];
} & Record<string, unknown>;

const marked = all<{
  youtube_id: string;
  src_url: string | null;
  title: string;
  segments_json: string;
}>(
  "SELECT youtube_id, src_url, title, segments_json FROM video WHERE segments_json NOT IN ('[]','')",
);

let attached = 0;
let orphaned = 0;
for (const v of marked) {
  const entry = catalogue.videos.find((e) =>
    v.src_url ? e.src_url === v.src_url : e.youtube_id === v.youtube_id,
  );
  if (!entry) {
    /* Marked up a video that is not in the catalogue — added by hand in the
       editor. Reported rather than dropped: the work is real and the fix is to
       add it to data/videos.json, which this script must not guess at. */
    console.log(
      `  ! not in the catalogue, segments left in the db: ${v.title}`,
    );
    orphaned++;
    continue;
  }
  entry.segments = JSON.parse(v.segments_json) as Segment[];
  attached++;
}

/* Entries whose segments were removed in the app should lose them here too, or
   the next seed would put them back — the file is the source of truth once it
   carries any. */
let removed = 0;
for (const e of catalogue.videos) {
  if (!e.segments?.length) continue;
  const stillMarked = marked.some((v) =>
    e.src_url ? v.src_url === e.src_url : v.youtube_id === e.youtube_id,
  );
  if (!stillMarked) {
    delete e.segments;
    removed++;
  }
}

/* `removed` is counted, not inferred from the result. */
if (attached || removed) {
  writeFileSync(VIDEOS, JSON.stringify(catalogue, null, 2) + "\n", "utf8");
  wrote++;
}
const totalSegments = marked.reduce(
  (n, v) => n + (JSON.parse(v.segments_json) as Segment[]).length,
  0,
);
console.log(
  `  videos     ${attached} episode(s), ${totalSegments} segment(s) → data/videos.json` +
    (removed ? `  (${removed} no longer segmented, cleared)` : "") +
    (orphaned ? `  (${orphaned} left behind)` : ""),
);

// --------------------------------------------------------------- mnemonics
const MNEMONICS = path.join(process.cwd(), "data", "mnemonics.json");
const mnemonics = all<{ id: string; lemma: string; mnemonic: string }>(
  "SELECT id, lemma, mnemonic FROM word WHERE mnemonic IS NOT NULL AND mnemonic != '' ORDER BY id",
);
if (mnemonics.length || existsSync(MNEMONICS)) {
  writeFileSync(
    MNEMONICS,
    JSON.stringify(
      {
        _comment:
          "Generated for leech words on somebody's own API key, exported so the next clone does not pay for them again. Written by `npm run export-content`, read by `npm run seed`. Safe to edit or delete a line you disagree with.",
        mnemonics: Object.fromEntries(mnemonics.map((m) => [m.id, m.mnemonic])),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  wrote++;
}
console.log(`  mnemonics  ${mnemonics.length} → data/mnemonics.json`);

console.log(
  `\n  ${wrote ? green("✓") : " "} ${wrote} file(s) written. ` +
    dim("Commit them and a fresh clone gets the same content."),
);
console.log(
  dim(
    "\n  Not exported, on purpose: progress (use `npm run backup`), and the\n" +
      "  cached explanations — those are keyed on real answers people typed,\n" +
      "  and this repository is public.\n",
  ),
);
