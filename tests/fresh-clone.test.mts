/**
 * What someone who just cloned the repo actually gets.
 *
 * Seeds a throwaway database from `data/` alone and checks the content is all
 * there. The developer's own database hides this: it accumulates everything
 * every script has ever written, so content can go missing from the committed
 * files while the running app still looks complete.
 *
 * That is not hypothetical. attach-examples.mts overwrote data/examples.json
 * with only the examples it found on that run, and the ~2,200 from earlier runs
 * survived only in the database. A fresh clone got 145 examples out of 2,400
 * and nothing said so. Audio was the same shape of bug: the .ogg files are
 * committed, but `audio_url` was set by the downloader, so a clone had every
 * recording on disk and no way to play one.
 *
 * needs: seeded database
 */
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ok, section, done } from "./harness.mts";

const dir = mkdtempSync(path.join(tmpdir(), "dm-fresh-"));
const dbPath = path.join(dir, "fresh.db");
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

section("npm run seed, on nothing");
const seed = spawnSync(process.execPath, ["scripts/seed.mts"], {
  cwd: process.cwd(),
  env: { ...process.env, DEUTSCHMATE_DB: dbPath },
  encoding: "utf8",
});
ok(seed.status === 0, "seeding a brand-new database succeeds",
  seed.status === 0 ? "" : (seed.stderr || "").split("\n").slice(-3).join(" "));
ok(existsSync(dbPath), "and the file exists");

const db = new DatabaseSync(dbPath, { readOnly: true });
const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

section("the course arrives complete");
const words = count("SELECT COUNT(*) n FROM word");
ok(words > 2000, "the whole deck", `${words} words`);
ok(count("SELECT COUNT(*) n FROM unit") === 120, "all 120 units");
ok(count("SELECT COUNT(*) n FROM grammar") === 36, "all 36 grammar points");
ok(count("SELECT COUNT(*) n FROM reading") > 30, "the readings",
  count("SELECT COUNT(*) n FROM reading"));
ok(count("SELECT COUNT(*) n FROM sentence") > 1500, "the levelled sentence corpus",
  count("SELECT COUNT(*) n FROM sentence"));

section("and nothing that only exists on this machine");
const examples = count(
  "SELECT COUNT(*) n FROM word WHERE example_de IS NOT NULL AND example_de <> ''",
);
const exPct = Math.round((examples / words) * 100);
ok(exPct >= 95, "examples come from data/examples.json, not from a local database",
  `${examples}/${words} (${exPct}%)`);

const audio = count("SELECT COUNT(*) n FROM word WHERE audio_url IS NOT NULL AND audio_url <> ''");
ok(audio > 1000, "recordings are linked without running the downloader", `${audio} linked`);

section("day one works");
/* A learner who has done nothing must still be given a first unit — the
   session builder reads these directly. */
const first = db
  .prepare("SELECT id, word_ids_json, grammar_id FROM unit WHERE level = 'A1.1' ORDER BY ord LIMIT 1")
  .get() as { id: string; word_ids_json: string; grammar_id: string | null };
ok(!!first, "there is a first unit", first?.id);
const firstWords = JSON.parse(first.word_ids_json) as string[];
ok(firstWords.length > 0, "it teaches words", firstWords.length);
const resolvable = (
  db.prepare(
    `SELECT COUNT(*) n FROM word WHERE id IN (${firstWords.map(() => "?").join(",")})`,
  ).get(...firstWords) as { n: number }
).n;
ok(resolvable === firstWords.length, "and every one of them resolves",
  `${resolvable} of ${firstWords.length}`);

db.close();
done();
