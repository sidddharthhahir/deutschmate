/**
 * What someone who just cloned the repo actually gets.
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
ok(
  seed.status === 0,
  "seeding a brand-new database succeeds",
  seed.status === 0 ? "" : (seed.stderr || "").split("\n").slice(-3).join(" "),
);
ok(existsSync(dbPath), "and the file exists");

const db = new DatabaseSync(dbPath, { readOnly: true });
const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

section("the course arrives complete");
const words = count("SELECT COUNT(*) n FROM word");
ok(words > 2000, "the whole deck", `${words} words`);
/*
 * A1.1 only for now (2026-09) — was 112 units across six levels; A1.2 through
 * B1.2 are deliberately unseeded while the Momente rewrite gets solid (see
 * data/deferred/README.md). Word content was untouched by that decision
 * (line above), only the units/grammar/readings built on top of it.
 */
ok(count("SELECT COUNT(*) n FROM unit") === 12, "all 12 units");
/* A floor, not a count — writing a new grammar point must not turn this red.
   The same lesson the scenario count taught when Alltag went from six to twelve.
   Was >= 36 across six levels; A1.1 alone ships 14. */
const grammar = count("SELECT COUNT(*) n FROM grammar");
ok(grammar >= 14, "the grammar points arrive", `${grammar}`);
/* Momente's A1.1 carries 6 readings of its own. Was >= 36 across six levels. */
ok(
  count("SELECT COUNT(*) n FROM reading") >= 6,
  "the readings",
  count("SELECT COUNT(*) n FROM reading"),
);
ok(
  count("SELECT COUNT(*) n FROM sentence") > 1500,
  "the levelled sentence corpus",
  count("SELECT COUNT(*) n FROM sentence"),
);

section("and nothing that only exists on this machine");
const examples = count(
  "SELECT COUNT(*) n FROM word WHERE example_de IS NOT NULL AND example_de <> ''",
);
const exPct = Math.round((examples / words) * 100);
ok(
  exPct >= 95,
  "examples come from data/examples.json, not from a local database",
  `${examples}/${words} (${exPct}%)`,
);

const audio = count(
  "SELECT COUNT(*) n FROM word WHERE audio_url IS NOT NULL AND audio_url <> ''",
);
ok(
  audio > 1000,
  "recordings are linked without running the downloader",
  `${audio} linked`,
);

section("day one works");
/* A learner who has done nothing must still be given a first unit — the
   session builder reads these directly. */
const first = db
  .prepare(
    "SELECT id, word_ids_json, grammar_id FROM unit WHERE level = 'A1.1' ORDER BY ord LIMIT 1",
  )
  .get() as { id: string; word_ids_json: string; grammar_id: string | null };
ok(!!first, "there is a first unit", first?.id);
const firstWords = JSON.parse(first.word_ids_json) as string[];
ok(firstWords.length > 0, "it teaches words", firstWords.length);
const resolvable = (
  db
    .prepare(
      `SELECT COUNT(*) n FROM word WHERE id IN (${firstWords.map(() => "?").join(",")})`,
    )
    .get(...firstWords) as { n: number }
).n;
ok(
  resolvable === firstWords.length,
  "and every one of them resolves",
  `${resolvable} of ${firstWords.length}`,
);

db.close();
done();
