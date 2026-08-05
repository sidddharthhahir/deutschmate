/**
 * Fetch native German pronunciations from Wikimedia Commons. node scripts/fetch-audio.mts German
 * Wiktionary recordings are named `De-<Lemma>.ogg`.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { DB_PATH } from "../src/lib/db.ts";

const ROOT = process.cwd();
const AUDIO_DIR = path.join(ROOT, "public", "audio", "words");
const API = "https://commons.wikimedia.org/w/api.php";
const BATCH = 50;

/** Wikimedia's robot policy requires a User-Agent naming the tool AND giving a contact. */
const CONTACT =
  process.env.WIKIMEDIA_CONTACT ??
  "https://github.com/local/deutschmate; personal language-learning project";
const UA = {
  "User-Agent": `DeutschMate/0.1 (${CONTACT}) node-fetch`,
  "Api-User-Agent": `DeutschMate/0.1 (${CONTACT})`,
  Accept: "*/*",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const db = new DatabaseSync(DB_PATH);
// The dev server usually holds this database open. Without a busy timeout the
// first contended write dies instantly with SQLITE_BUSY, part-way through a
// long download run. Wait for the lock instead.
db.exec("PRAGMA busy_timeout = 10000");
const words = db
  .prepare("SELECT id, lemma FROM word ORDER BY freq_rank")
  .all() as unknown as { id: string; lemma: string }[];

mkdirSync(AUDIO_DIR, { recursive: true });

/** Ask the API for up to 50 file titles at once. Returns title -> download URL. */
async function resolveBatch(files: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const titles = files.map((f) => "File:" + f).join("|");
  const url = `${API}?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=url&titles=${encodeURIComponent(titles)}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: UA });
    const text = await res.text();
    if (!res.ok || !text.trimStart().startsWith("{")) {
      // Rate limited or an HTML error page — back off and retry.
      await sleep(1500 * (attempt + 1));
      continue;
    }
    const data = JSON.parse(text) as {
      query?: {
        pages?: {
          title: string;
          missing?: boolean;
          imageinfo?: { url: string }[];
        }[];
      };
    };
    for (const p of data.query?.pages ?? []) {
      const u = p.imageinfo?.[0]?.url;
      if (u) out.set(p.title.replace(/^File:/, ""), u);
    }
    return out;
  }
  console.warn("  ! batch failed after retries");
  return out;
}

/** Candidate filenames, tried in rounds so common cases cost one batch. */
const rounds: ((lemma: string) => string | null)[] = [
  (l) => `De-${l}.ogg`,
  (l) => `De-${l}2.ogg`,
  (l) => (l !== l.toLowerCase() ? `De-${l.toLowerCase()}.ogg` : null),
  (l) => `De-at-${l}.ogg`,
];

const resolved = new Map<string, string>(); // wordId -> download URL
let pending = words.filter(
  (w) => !existsSync(path.join(AUDIO_DIR, `${w.id}.ogg`)),
);
const alreadyOnDisk = words.length - pending.length;

for (const [i, mk] of rounds.entries()) {
  if (!pending.length) break;
  const map = new Map<string, string>(); // filename -> wordId
  for (const w of pending) {
    const f = mk(w.lemma);
    if (f) map.set(f, w.id);
  }
  const files = [...map.keys()];
  if (!files.length) continue;

  process.stdout.write(`round ${i + 1}: ${files.length} candidates `);
  let found = 0;
  for (let j = 0; j < files.length; j += BATCH) {
    const hits = await resolveBatch(files.slice(j, j + BATCH));
    for (const [title, url] of hits) {
      const id = map.get(title);
      if (id && !resolved.has(id)) {
        resolved.set(id, url);
        found++;
      }
    }
    process.stdout.write(".");
    await sleep(400);
  }
  console.log(` → ${found} resolved`);
  pending = pending.filter((w) => !resolved.has(w.id));
}

// ---------------------------------------------------------------- download
const setAudio = db.prepare(
  "UPDATE word SET audio_url=?, audio_source=? WHERE id=?",
);
let downloaded = 0;

if (alreadyOnDisk) {
  for (const w of words) {
    if (existsSync(path.join(AUDIO_DIR, `${w.id}.ogg`)))
      setAudio.run(`/audio/words/${w.id}.ogg`, "commons", w.id);
  }
}

console.log(`downloading ${resolved.size} files...`);
let throttled = 0;
let firstFailure = "";
for (const [id, url] of resolved) {
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) {
      writeFileSync(
        path.join(AUDIO_DIR, `${id}.ogg`),
        Buffer.from(await res.arrayBuffer()),
      );
      setAudio.run(`/audio/words/${id}.ogg`, "commons", id);
      downloaded++;
      process.stdout.write("▪");
      ok = true;
      break;
    }
    if (res.status === 429) {
      throttled++;
      // Honour retry-after, but cap it — a 600s wait means stop, not sleep.
      const wait = Math.min(Number(res.headers.get("retry-after") ?? 5), 30);
      process.stdout.write("~");
      await sleep(wait * 1000);
    } else {
      // Never fail silently: a 403/404 here is a policy or naming bug, not a
      // missing recording, and an unexplained "x" costs an hour to diagnose.
      if (!firstFailure)
        firstFailure = `HTTP ${res.status} ${res.statusText} — ${(await res.text()).slice(0, 160).replace(/\s+/g, " ")}`;
      break;
    }
  }
  if (!ok) process.stdout.write("x");
  await sleep(250);
}
if (throttled)
  console.log(`\n  (${throttled} requests were throttled and retried)`);
if (firstFailure) console.log(`\n  ! first download failure: ${firstFailure}`);

const have = alreadyOnDisk + downloaded;
const pct = Math.round((have / words.length) * 100);
console.log(`\n\n✓ ${have}/${words.length} words have native audio (${pct}%)`);

const missing = words.filter(
  (w) => !existsSync(path.join(AUDIO_DIR, `${w.id}.ogg`)),
);
if (missing.length) {
  writeFileSync(
    path.join(ROOT, "data", "missing-audio.json"),
    JSON.stringify(
      missing.map((m) => ({ id: m.id, lemma: m.lemma })),
      null,
      2,
    ),
  );
  console.log(`  ${missing.length} need Piper TTS → data/missing-audio.json`);
}

const bytes = words
  .map((w) => path.join(AUDIO_DIR, `${w.id}.ogg`))
  .filter(existsSync)
  .reduce((n, f) => n + statSync(f).size, 0);
console.log(`  ${(bytes / 1024 / 1024).toFixed(1)} MB on disk`);
