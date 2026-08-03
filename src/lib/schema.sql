-- DeutschMate schema
-- Two halves, deliberately separated (spec §10):
--   CONTENT  — global, identical for every user, committed to the repo
--   PROGRESS — per user, never shared, never committed
-- Getting this split right now avoids a painful migration later.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- SQLite's default busy timeout is 0: a second connection that hits a lock
-- fails immediately with SQLITE_BUSY rather than waiting. That happens the
-- moment a seed/audio script runs while `npm run dev` is up — which is the
-- normal working state. Wait instead of dying.
PRAGMA busy_timeout = 10000;

-- ============================================================
-- CONTENT
-- ============================================================

CREATE TABLE IF NOT EXISTS word (
  id            TEXT PRIMARY KEY,          -- slug: "haus", "gehen", "gross"
  lemma         TEXT NOT NULL,             -- "Haus"
  article       TEXT,                      -- der | die | das | NULL for non-nouns
  plural        TEXT,                      -- "Häuser"
  pos           TEXT NOT NULL,             -- noun | verb | adj | adv | prep | conj | pron | num | phrase
  ipa           TEXT,
  en            TEXT NOT NULL,             -- primary English gloss
  level         TEXT NOT NULL,             -- A1.1 A1.2 A2.1 A2.2 B1.1 B1.2
  topic         TEXT,                      -- family, food, travel, ...
  audio_url     TEXT,                      -- /audio/words/haus.ogg
  audio_source  TEXT,                      -- commons | piper | NULL
  forms_json    TEXT,                      -- verb conjugations, comparatives
  mnemonic      TEXT,                      -- generated once at build time
  example_de    TEXT,
  example_en    TEXT,
  freq_rank     INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_word_level ON word(level);
CREATE INDEX IF NOT EXISTS idx_word_topic ON word(topic);
CREATE INDEX IF NOT EXISTS idx_word_freq  ON word(freq_rank);

CREATE TABLE IF NOT EXISTS sentence (
  id            TEXT PRIMARY KEY,
  de            TEXT NOT NULL,
  en            TEXT NOT NULL,
  level         TEXT NOT NULL,
  word_ids_json TEXT NOT NULL DEFAULT '[]',  -- which words it uses (constraint checking)
  audio_url     TEXT,
  source        TEXT                          -- tatoeba | generated | curated
);
CREATE INDEX IF NOT EXISTS idx_sentence_level ON sentence(level);

CREATE TABLE IF NOT EXISTS grammar (
  id            TEXT PRIMARY KEY,          -- "praesens-regular"
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  level         TEXT NOT NULL,
  ord           INTEGER NOT NULL,
  explain_md    TEXT NOT NULL,             -- short + visual, never a wall of text
  examples_json TEXT NOT NULL DEFAULT '[]',
  drills_json   TEXT NOT NULL DEFAULT '[]',
  prereq_json   TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS unit (
  id            TEXT PRIMARY KEY,          -- "a1-1-u01"
  level         TEXT NOT NULL,
  ord           INTEGER NOT NULL,
  title         TEXT NOT NULL,
  can_do_json   TEXT NOT NULL DEFAULT '[]', -- spec §4: never show a bare unit number
  word_ids_json TEXT NOT NULL DEFAULT '[]',
  grammar_id    TEXT REFERENCES grammar(id),
  video_id      TEXT,
  reading_id    TEXT,
  scenario_json TEXT,                       -- AI roleplay brief
  dialogue_json TEXT,                       -- scripted offline fallback (spec §17)
  prereq_json   TEXT NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_level_ord ON unit(level, ord);

CREATE TABLE IF NOT EXISTS video (
  id            TEXT PRIMARY KEY,
  youtube_id    TEXT NOT NULL,
  title         TEXT NOT NULL,
  level         TEXT NOT NULL,
  channel       TEXT,
  unit_id       TEXT,
  segments_json TEXT NOT NULL DEFAULT '[]'  -- [{t_start,t_end,de,en}]
);
CREATE INDEX IF NOT EXISTS idx_video_unit ON video(unit_id);

CREATE TABLE IF NOT EXISTS reading (
  id             TEXT PRIMARY KEY,
  unit_id        TEXT REFERENCES unit(id),
  level          TEXT NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  word_count     INTEGER NOT NULL DEFAULT 0,
  questions_json TEXT NOT NULL DEFAULT '[]',
  glossary_json  TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_reading_unit ON reading(unit_id);

-- Write-through cache (spec §12). Live-generated explanations get written
-- back here, so cost decays toward zero as the table fills.
CREATE TABLE IF NOT EXISTS error_pattern (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tag           TEXT NOT NULL,
  signature     TEXT NOT NULL UNIQUE,      -- normalised "expected|got" key
  explain_md    TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'generated',  -- prebuilt | generated
  hits          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_error_tag ON error_pattern(tag);

/* Sentence explanations, write-through cached (spec §12).
   Global, not per-user: two learners at A1 ask about the same sentences, so
   the second one gets the answer free. Keyed by the normalised sentence. */
CREATE TABLE IF NOT EXISTS explanation (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  signature  TEXT NOT NULL UNIQUE,
  sentence   TEXT NOT NULL,
  level      TEXT NOT NULL,
  body_md    TEXT NOT NULL,
  hits       INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- PROGRESS
-- ============================================================

CREATE TABLE IF NOT EXISTS user (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,
  level             TEXT NOT NULL DEFAULT 'A1.1',
  daily_goal_min    INTEGER NOT NULL DEFAULT 60,
  browse_batch_size INTEGER NOT NULL DEFAULT 50,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One FSRS card per (user, thing-to-remember). ref_type: word | grammar | cloze
CREATE TABLE IF NOT EXISTS card (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  ref_type    TEXT NOT NULL,
  ref_id      TEXT NOT NULL,
  due         TEXT NOT NULL,
  stability   REAL    NOT NULL DEFAULT 0,
  difficulty  REAL    NOT NULL DEFAULT 0,
  elapsed_days INTEGER NOT NULL DEFAULT 0,
  scheduled_days INTEGER NOT NULL DEFAULT 0,
  reps        INTEGER NOT NULL DEFAULT 0,
  lapses      INTEGER NOT NULL DEFAULT 0,
  state       INTEGER NOT NULL DEFAULT 0,   -- 0 New 1 Learning 2 Review 3 Relearning
  last_review TEXT,
  -- Parked by the learner from Problemwörter. Excluded from every due query,
  -- never deleted: the history stays, the card just stops coming back.
  suspended   INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, ref_type, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_card_due ON card(user_id, due);

CREATE TABLE IF NOT EXISTS attempt (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,           -- review | builder | listening | writing | speaking | quiz
  ref_id          TEXT,
  correct         INTEGER NOT NULL,        -- 0/1
  user_answer     TEXT,
  expected        TEXT,
  error_tags_json TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attempt_user_time ON attempt(user_id, created_at);

CREATE TABLE IF NOT EXISTS unit_progress (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  unit_id      TEXT NOT NULL REFERENCES unit(id),
  status       TEXT NOT NULL DEFAULT 'locked',  -- locked | active | complete
  completed_at TEXT,
  UNIQUE(user_id, unit_id)
);

CREATE TABLE IF NOT EXISTS browse_progress (
  user_id      TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  last_word_id TEXT,
  words_seen   INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  minutes     INTEGER NOT NULL DEFAULT 0,
  blocks_json TEXT NOT NULL DEFAULT '[]',
  streak_day  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date)
);

/* Cloze cards — per-user, because they're mined from things this learner
   actually did: a sentence they got wrong, or a line they tapped while reading.
   `answer` is the single blanked token, `sentence` keeps ___ where it was. */
CREATE TABLE IF NOT EXISTS cloze (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  sentence    TEXT NOT NULL,          -- "Ich esse ___ Apfel."
  answer      TEXT NOT NULL,          -- "einen"
  full        TEXT NOT NULL,          -- the intact sentence, for review
  en          TEXT,
  source      TEXT NOT NULL,          -- error | reading | manual
  source_ref  TEXT,                   -- reading id, word id, attempt id
  tag         TEXT,                   -- the error tag, when mined from a mistake
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, sentence, answer)
);
CREATE INDEX IF NOT EXISTS idx_cloze_user ON cloze(user_id);

/* Exam runs. One row per completed practice exam, so scores are a real
   history rather than a number recomputed on each visit. */
CREATE TABLE IF NOT EXISTS exam_run (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  level       TEXT NOT NULL,
  sections_json TEXT NOT NULL,        -- [{key,correct,total}]
  correct     INTEGER NOT NULL,
  total       INTEGER NOT NULL,
  minutes     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_exam_user ON exam_run(user_id, created_at);

-- Offline writing queue (spec §17): submitted offline, corrected on reconnect.
CREATE TABLE IF NOT EXISTS pending_correction (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  prompt     TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
