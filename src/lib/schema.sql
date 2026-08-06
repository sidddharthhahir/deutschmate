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
  -- No `ipa`. It was in the schema, rendered on /wort, and NULL for all 2,400
  -- words, because nothing in the repo produces it. 2,373 of those words have a
  -- native recording instead, which is the better answer to "how does this
  -- sound" anyway.
  en            TEXT NOT NULL,             -- primary English gloss
  level         TEXT NOT NULL,             -- A1.1 A1.2 A2.1 A2.2 B1.1 B1.2
  topic         TEXT,                      -- family, food, travel, ...
  audio_url     TEXT,                      -- /audio/words/haus.ogg
  audio_source  TEXT,                      -- commons | piper | NULL
  forms_json    TEXT,                      -- verb conjugations, comparatives
  mnemonic      TEXT,                      -- on demand, and only for leeches
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

/* A video is either a YouTube embed or a direct media file.
   The course videos are Deutsche Welle's "Nicos Weg", and DW publishes all 226
   episodes as mp4s on their own CDN through an official podcast feed — YouTube
   only exposed 14 of them without a consent wall. So src_url is the main path
   now and youtube_id is kept for the handful DW does not put in the feed (the
   full-length films, the Rückblick recaps).
   youtube_id is '' rather than NULL for a file-backed row: the column is NOT
   NULL and was there first, and rewriting a table to relax that is not worth
   it. lib/player.ts decides which to use. */
CREATE TABLE IF NOT EXISTS video (
  id            TEXT PRIMARY KEY,
  youtube_id    TEXT NOT NULL,
  src_url       TEXT,                       -- direct mp4; wins over youtube_id
  duration      INTEGER,                    -- seconds, from the feed
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
  /* Who paid for this row. NULL for prebuilt entries, which cost nobody
     anything. Rows here stay shared — the set of mistakes German learners make
     is finite and small, and one person's explanation of "der → den" is the
     right answer for everyone. The column exists so that "shared" is a fact
     with an author rather than an anonymous pile, and so a learner can take
     their contributions back (see lib/shared-cache.ts). */
  created_by    TEXT,
  hits          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_error_tag ON error_pattern(tag);
CREATE INDEX IF NOT EXISTS idx_error_by ON error_pattern(created_by);

/* Sentence explanations, write-through cached (spec §12).
   Keyed by the normalised sentence.

   SHARED ONLY WHEN THE SENTENCE IS THE APP'S OWN.

   This started as one global table, which was right when the only sentences
   reaching it came from the curriculum: you and your flatmate read the same 38
   texts, so the second person to ask got the answer free. Then /text let anyone
   paste any German they liked — a letter from the Ausländerbehörde, a message
   from their landlord, a doctor's note — and the whole sentence was written
   verbatim into a table every account on the install reads from.

   So the row now records who asked and whether it may be shared. `shared` is
   set by the server, from whether the sentence actually occurs in app content;
   it is never taken from the request, because a client that asks to share is
   not evidence that the text is safe to share. Everything else stays private to
   its author and is theirs to delete. */
CREATE TABLE IF NOT EXISTS explanation (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  signature  TEXT NOT NULL UNIQUE,
  sentence   TEXT NOT NULL,
  level      TEXT NOT NULL,
  body_md    TEXT NOT NULL,
  created_by TEXT,
  shared     INTEGER NOT NULL DEFAULT 0,
  hits       INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_explanation_by ON explanation(created_by);

-- ============================================================
-- PROGRESS
-- ============================================================

CREATE TABLE IF NOT EXISTS user (
  id                TEXT PRIMARY KEY,
  -- The username. Already UNIQUE, which is what lets it be the login identity.
  name              TEXT NOT NULL UNIQUE,
  -- Optional, and no longer part of signing in. Kept for accounts that had one.
  email             TEXT,
  level             TEXT NOT NULL DEFAULT 'A1.1',

  -- scrypt, per-user salt, versioned (lib/password.ts). NULL for an account
  -- with no password yet, which cannot sign in until it has one.
  password_hash     TEXT,
  -- sha256 of the recovery code shown once at sign-up. With no email to send a
  -- reset to, this is the only way back in without the operator.
  recovery_hash     TEXT,

  /*
   * The learner's own Anthropic key, encrypted (lib/secrets.ts).
   *
   * Each person brings their own, so the AI features cost this install nothing
   * and nobody can spend anybody else's. The key is a live credential belonging
   * to someone else, so what is stored is AES-256-GCM ciphertext and never the
   * key — a backup that leaves the machine must not be a list of API keys.
   *
   * `api_key_hint` is the last four characters. Not a secret; it exists so the
   * settings page can say which key is stored without printing it.
   */
  api_key_enc       TEXT,
  api_key_hint      TEXT,
  api_key_at        TEXT,

  /*
   * This learner's own monthly ceiling, in cents. NULL means "use the
   * deployment default" (DEUTSCHMATE_BUDGET).
   *
   * It was a server-wide env var, which made sense when the operator paid. Now
   * the money is theirs, so the cap is theirs — it stops being a limit imposed
   * on them and becomes a brake they set on their own spending.
   */
  budget_cents      INTEGER,
  -- No `daily_goal_min`, no `browse_batch_size`. Both defaulted, neither had a
  -- screen that could change it, and nothing obeyed them — the plan decides how
  -- long a session is and /api/wortschatz owns its page size.
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Partial, because several legacy rows may have no address and NULL is not a
-- duplicate of NULL for a plain UNIQUE anyway — stating it is clearer than
-- relying on that. ALTER TABLE cannot add UNIQUE, so this is also how the
-- constraint reaches a database that predates the column.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email ON user(email) WHERE email IS NOT NULL;

/*
 * Sign-in tokens and sessions.
 *
 * BOTH ARE STORED HASHED. The row is a verifier, not a credential: a copy of
 * this database — a backup on a laptop, a file pulled off a box — must not let
 * anybody sign in as anybody. sha256 is right here because the secret is 32
 * random bytes, not a password; there is nothing to brute-force.
 *
 * No passwords anywhere, deliberately. A password needs storage, a reset flow,
 * and a policy, and every one of those is a way to leak. A short-lived
 * single-use link needs none of them.
 */
CREATE TABLE IF NOT EXISTS auth_token (
  hash        TEXT PRIMARY KEY,          -- sha256 of the token, never the token
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,                      -- single use: set on redemption
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_token_user ON auth_token(user_id, expires_at);

CREATE TABLE IF NOT EXISTS session (
  hash        TEXT PRIMARY KEY,          -- sha256 of the cookie value
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  seen_at     TEXT NOT NULL DEFAULT (datetime('now')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_session_user ON session(user_id, expires_at);

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

/*
 * Which words have been looked at in the browser.
 *
 * This replaced a single running counter, `browse_progress.words_seen`, which
 * was incremented by the size of each batch with no deduplication. Paging back
 * and forward re-counted; switching topic re-counted; the number was rendered
 * as the first headline stat on /fortschritt directly above a paragraph
 * insisting the counts are honest, and it could climb past the 2,400 words that
 * exist. One row per word makes "gesehen" mean what it says.
 */
CREATE TABLE IF NOT EXISTS word_seen (
  user_id  TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  word_id  TEXT NOT NULL REFERENCES word(id),
  seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, word_id)
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

/* Every model call, with the token counts the API actually reported.
   The €10/month ceiling was a hope until this table existed: the usage numbers
   were already coming back on every response and were being thrown away, so
   there was no way to answer "what did this cost". Cost is stored in
   millionths of a dollar because the per-call amounts are far below a cent. */
CREATE TABLE IF NOT EXISTS usage (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,        -- chat | review | writing | explain | mistake
  model        TEXT NOT NULL,
  input        INTEGER NOT NULL DEFAULT 0,
  output       INTEGER NOT NULL DEFAULT 0,
  cache_read   INTEGER NOT NULL DEFAULT 0,
  cache_write  INTEGER NOT NULL DEFAULT 0,
  micros       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_usage_user_time ON usage(user_id, created_at);

-- Offline writing queue (spec §17): submitted offline, corrected on reconnect.
CREATE TABLE IF NOT EXISTS pending_correction (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  prompt     TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
