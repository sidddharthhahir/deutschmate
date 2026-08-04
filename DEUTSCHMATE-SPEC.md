# DeutschMate — Final Product & Build Spec

**Goal:** A1.1 → B1.2 in 6 months of self-study, 1–2 focused hours a day.
**Scope:** A1.1 · A1.2 · A2.1 · A2.2 · B1.1 · B1.2 — nothing above B1.2.
**Users:** me + roommate now; anyone later.
**Budget:** ~$13 one-time content build + ~$7–9/month runtime. Ceiling $10/mo.

> **This is the plan, not the record.** It was written before the code and has
> deliberately not been rewritten to agree with it — a spec quietly edited to
> match the implementation stops being useful, because you can no longer tell a
> decision from a drift. Where the build differs, **§20 lists every change and
> why**. Three headline ones, so nothing here misleads on a first read:
>
> - the deck reached **2,400 words**, so the course is nearer **seven months**
>   than six (§4 still says six)
> - a session is **4–10 blocks**, not 6, and old scenarios and readings now come
>   back on a rotation (§3)
> - the $10 ceiling is **enforced before every paid call**, not just planned
>   against (§13)
>
> For what the app does today, read `README.md`.

---

## 0. The one-sentence product

> Open the app, press one button, and for the next hour you never decide
> anything — it teaches, drills, listens, corrects, and remembers for you.

Every feature must earn its place against that sentence. If it adds a decision
for the user, it's probably wrong.

### The four principles

Every future decision gets checked against these. They are not implementation
notes; they are the reasons to say no.

**1. One button.** The app decides what you study. Never ask the user to
choose a lesson, a skill, or a difficulty. Decision fatigue is the enemy.

**2. Offline-first.** A complete daily session must be finishable in airplane
mode. Every block has an offline path; the session runner never dead-ends.

**3. Vocabulary-constrained AI.** Every generated sentence uses only words the
learner already knows. This is what separates a teacher from a chatbot.

**4. Never fake progress.** If a number can't be traced to something the user
actually did, it does not go on screen.

> No estimated CEFR level. No pronunciation percentage. No "78% chance of
> passing." No AI confidence score. No merged "words seen + words learned."
>
> Only: real counts, real review history, real error tallies, real Modellsatz
> results.

Principle 4 is the one that will be tested most often, because invented metrics
always look impressive in a mockup. The test is simple: **point at the row in
the database that produced this number.** If you can't, delete the number.

---

## 1. Scope is locked at B1.2 — and that simplifies everything

Capping at B1.2 removes the single messiest part of the data pipeline. The
Goethe-Institut publishes **official Wortlisten for A1, A2, and B1** — free
PDFs, cumulative, ~2,400 words total. That is the complete vocabulary universe
of this app. No frequency lists, no corpus mining, no "is this really B2?"
judgement calls, no unofficial word sourcing.

| Level | Cumulative words | Source |
|---|---|---|
| A1 | ~650 | Goethe Wortliste A1 |
| A2 | ~1,300 | Goethe Wortliste A2 |
| B1 | ~2,400 | Goethe Wortliste B1 |

Three consequences, all good:

1. **Every word gets the full treatment.** 2,400 is small enough that all of
   them get AI-generated mnemonics and custom example sentences in the one-time
   build. No lazy-enrichment tier, no two-class word system.
2. **The browse deck and the study deck are the same 2,400 words.** See §5 —
   this makes the Wortschatz section far better than a separate corpus would.
3. **Audio is ~72 MB** (2,400 files), not 180 MB. Comfortably committable.

---

## 2. The core loop

One primary screen, one primary button.

```
        Guten Abend, Siddharth
        A1.2  ·  Unit 14 of 20  ·  Day 23  🔥

        ┌─────────────────────────────┐
        │   ▶  Heutige Sitzung        │
        │      58 min · 34 reviews    │
        │      + 12 new words         │
        └─────────────────────────────┘

        [ Wortschatz ]  [ Üben ]  [ Fortschritt ]
```

No lesson list. No course map. No "choose a skill." The scheduler decided; the
button starts it.

---

## 3. Session structure

Fixed rhythm, variable content. The rhythm never changes so it becomes a habit;
the scheduler chooses what fills each block.

| # | Block | Min | What happens | Needs net? |
|---|-------|-----|--------------|------------|
| 1 | **Aufwärmen** — Review | 12 | FSRS-due cards: words + grammar. Always first. | No |
| 2 | **Fix** | 5 | Targeted drills on your top 3 error tags. Skipped if none. | No |
| 3 | **Neu** — New material | 15 | Either 12 new words **or** 1 grammar point. Never both. | No |
| 4 | **Input** | 15 | Listening or reading, using only words you know. | No* |
| 5 | **Output** | 12 | Speaking · writing · AI conversation. | Partly |
| 6 | **Abschluss** | 4 | 8-question quiz + daily recap. | No |

\* Video needs network; listening and reading do not. Offline swaps the video
for an audio drill.

**Why new vocab and new grammar never share a day:** two novel cognitive loads
in one session halves retention of both. Alternate: vocab day, grammar day.

**Blocks are skippable, the session is not.** Skip block 5 when you're tired.
Never skip block 1 — that's the block that makes you remember.

### Every block must have an offline path

**A full session must be completable with zero network.** See §17. Block 5 is
the only one with an AI-dependent variant, so it always has two offline
alternatives ready (speaking drill, written translation with deferred
correction). The session runner picks an offline variant automatically when
`navigator.onLine` is false or the API errors — it never blocks or shows a
dead end.

### The daily recap (block 6)

The session doesn't just end — it reports.

```
        Heute geschafft                       58 min

        12 neue Wörter        56 Wiederholungen
        1 Grammatikthema      Hören 92% · Sprechen 81%

        Häufigster Fehler     der vs. den   (7×)
        → morgen im Fix-Block

        Morgen                Restaurant-Wortschatz
```

Cheap to build (it's all in `attempt` and `session_log`), and it's what
converts "I did some exercises" into "I'm getting somewhere."

---

## 4. Curriculum shape

```
6 levels × 20 units = 120 units
A1.1  A1.2  A2.1  A2.2  B1.1  B1.2
```

~1.5 days per unit → **180 days**. The math works with no slack; a missed week
has to be caught up, not absorbed.

**A unit** is the atomic content package:

| Field | Example |
|---|---|
| Title | "Im Restaurant" |
| Level | A2.1 |
| **Can-do** | `["order a meal", "ask what something costs", "pay and tip"]` |
| Words | 14, drawn from the Goethe list for that level |
| Grammar point | Akkusativ with definite articles |
| Video | one embedded clip, sentence-timestamped |
| Reading | 1 short text (80–250 words by level) |
| Conversation | 1 roleplay scenario + AI persona brief |
| Prerequisites | `["a2-1-unit-11", "grammar:nominativ"]` |

### Can-do statements — never show a bare unit number

Every unit carries 2–4 can-do statements, and the app leads with those rather
than with "Unit 14."

```
        Heute lernst du                       58 min

        ✓  order a meal in a restaurant
        ✓  ask what something costs
        ✓  pay and leave a tip
```

This is how CEFR itself is defined, so it costs one extra field
(`unit.can_do_json`) and makes every session feel like it buys you something
concrete. The same statements become the tick-list in the daily recap.

---

## 5. Wortschatz — the browse-everything section

A separate tab from the daily session, holding **all 2,400 A1–B1 words**.
Read 50 or 100 a day at your own pace.

```
Wortschatz              A1 · A2 · [B1] · Alle
Heute: 50 / 100                    ── 34 / 50 ──

  die  Entwicklung, -en          development
       Die Entwicklung dauert lange.        🔊  [+ Deck]
       ↳ Unit 88 · B1.1

  ✓ entscheiden (entschied, entschieden)    to decide
       Ich muss mich heute entscheiden.     🔊   im Deck

  der  Zusammenhang, ¨-e         connection, context
       Das steht im Zusammenhang damit.     🔊  [+ Deck]
       ↳ Unit 94 · B1.2
```

- Filter by level, topic, or part of speech
- Daily batch of 50 or 100, frequency-ordered, remembers where you stopped
- Keyboard / swipe through them fast
- ✓ marks words already in your active deck
- Native audio on every word
- **One tap adds it to real SRS**

**Because the browse deck is the curriculum deck**, each row can show which unit
that word belongs to. So browsing isn't a parallel activity — it's *reading
ahead* in your own course. Tapping `[+ Deck]` means "teach me this now, before
Unit 88 comes around," and the scheduler honours it.

At 100/day you cycle the entire A1–B1 vocabulary in ~24 days. Running that loop
continuously while your active study catches up is genuine priming: by the time
Unit 88 arrives you've passively seen *Entwicklung* six times.

**One honest design point:** reading 100 words a day and *learning* 100 words a
day are different things. Passive reading builds recognition, not recall. So:

- `Words seen` and `Words mastered` are **separate numbers on the dashboard**
  and never get merged.
- The `[+ Deck]` button is the point of the feature — it's a discovery funnel
  into the real study loop, not a competitor to it.

---

## 6. Feature list, in build order

### Tier 1 — the spine

1. **Vocabulary SRS** — FSRS cards via the `ts-fsrs` npm package (MIT). Never
   hand-roll intervals. Each card: lemma, article + plural, IPA, native audio,
   an example sentence using only words you already know, an AI mnemonic. All
   pre-generated — no API call at review time.
2. **Wortschatz browse section** — §5.
3. **Grammar module** — ~60 points across the 6 levels. Short visual
   explanations, never walls of text, plus 10 drill items each. Grammar points
   get FSRS cards too: you review the *concept* on a schedule via a fresh item.
4. **Sentence builder** — the workhorse. English sentence → arrange German word
   tiles. On error, explain *why*: from the pre-built error-pattern table for
   known mistakes, from a live call for novel ones. Every attempt writes tags.
5. **Listening drill** — sentence audio → type what you hear → diff highlights
   what you missed. 0.75× / 1× / 1.25×. Transcript hidden by default.
6. **AI conversation** — roleplay scenarios (restaurant, doctor, Bahnhof,
   WG-Besichtigung). Constrained to your known vocabulary — see §8. Grammar
   corrections come *after* the conversation, never mid-flow.
7. **Writing correction** — prompt → text box → structured correction: what was
   wrong, why, a more natural alternative. Errors tagged.
8. **Video player** — YouTube IFrame embed with your own control layer:
   sentence timestamps, tap-to-loop a line, 0.75× speed, tap a word to add it.
   Sources: *Your German Teacher* (labeled by exact sub-level), DW *Nicos Weg*,
   Easy German.
9. **Reading** — short texts, tap any word for a gloss, comprehension questions.
   By B1, real `nachrichtenleicht.de` articles.
10. **Speaking** — record → transcribe → diff against target → highlight the
    words the recognizer misheard. Honest and actionable. **No fake score.**
    See §18 for the sound-level view and why it must be derived, not invented.
11. **Word detail page** — tap any word anywhere and get everything: audio, IPA,
    article + plural, all forms, mnemonic, every example sentence it appears in,
    which unit teaches it, your own review history, and every mistake you've
    made with it. Pure joins over data that already exists — cheap to build,
    and it becomes the thing you actually browse.
12. **Progress** — words mastered / 2,400. Unit N of 120. Per-skill accuracy
    from real attempt history. Real Goethe Modellsatz scores. Nothing invented.

### Tier 2 — after two weeks of daily use

Free practice mode · saved-mistakes library · weekly Modellsatz runner ·
personal deck additions · dark mode · keyboard shortcuts · mobile polish.

### Tier 3 — month 3+, only if the habit is sticking

Immersion mode (German UI) · fake WhatsApp / email scenarios · shadowing ·
custom story generation from your interests.

### Cut, deliberately

Waveform comparison · accent percentage · "Goethe pass probability" ·
estimated CEFR level · per-word images · XP · badges · achievements ·
leaderboards · Netflix clips · vector DB · anything above B1.2.

---

## 7. Mastery and unlocking

Three signals, all computable, none invented.

| Signal | Definition |
|---|---|
| Word **seen** | appeared in a Wortschatz browse batch |
| Word **learned** | seen ≥3 times in study, last 2 reviews correct |
| Word **mastered** | FSRS stability > 30 days |
| Grammar mastery | rolling accuracy over last 20 attempts, 0–100 |
| Unit **complete** | ≥80% of its words *learned* AND its grammar ≥70 |

A unit unlocks when its prerequisites are complete. Level progress is
`units_complete / 20`. That's the whole progression engine — no ML, no scoring
model, just counting things that actually happened.

---

## 8. The vocabulary constraint (the most important feature)

Every AI-generated sentence, every conversation turn, every example uses **only
words the learner already knows**, plus the current unit's new words.

```
system: You are a German tutor speaking to an A1.2 learner.
        You may ONLY use these words: [ich, du, sein, haben, gehen, ...]
        (~340 words at A1.2, ~2400 by B1.2)
        Never use a word outside this list. If you need a concept you
        cannot express with these words, choose a simpler concept.
```

This is what makes it feel like a teacher instead of ChatGPT. A beginner
talking to an unconstrained model gets fluent German they can't read, gives up,
and blames themselves. This one constraint prevents that.

The word list is large but **identical across requests**, so it lives in the
cached prompt prefix — cache reads cost ~10% of normal input. Without prompt
caching this would be the app's biggest expense; with it, it's nearly free.

Capping at B1.2 helps here too: the list tops out at 2,400 words, so the cached
prefix never grows beyond a few thousand tokens.

---

## 9. Personalization = counting mistakes

Every attempt writes error tags:

```json
["akkusativ", "article-der-den", "verb-position-2", "plural-en"]
```

Tomorrow's **Fix** block is:

```sql
SELECT tag, COUNT(*) FROM attempt_tags
WHERE user_id = ? AND created_at > date('now','-14 days')
GROUP BY tag ORDER BY COUNT(*) DESC LIMIT 3;
```

That's the entire adaptive-learning engine. Counting mistakes *is* adaptive
learning. Anything fancier means building an ML system instead of learning
German.

---

## 10. Data model

**Global content** — shared by all users, built once, committed to the repo:

```sql
word(id, lemma, article, plural, pos, ipa, en, level, topic,
     audio_url, forms_json, mnemonic, example_de, example_en, freq_rank)
sentence(id, de, en, level, word_ids_json, audio_url, source)
grammar(id, slug, title, level, ord, explain_md, examples_json, prereq_json)
unit(id, level, ord, title, word_ids_json, grammar_id, video_id,
     reading_id, scenario_json, prereq_json)
video(id, youtube_id, title, level, segments_json)   -- [{t_start,t_end,de,en}]
error_pattern(id, tag, trigger_regex, explain_md)
```

**Per-user** — never shared:

```sql
user(id, name, level, daily_goal_min, browse_batch_size, created_at)
card(id, user_id, ref_type, ref_id, due, stability, difficulty,
     reps, lapses, state)                            -- FSRS state
attempt(id, user_id, kind, ref_id, correct, user_answer,
        error_tags_json, created_at)
unit_progress(id, user_id, unit_id, status, completed_at)
browse_progress(id, user_id, last_word_id, words_seen, updated_at)
session_log(id, user_id, date, minutes, blocks_json, streak_day)
```

Two users, shared content, separate progress. Get this split right in the first
migration — retrofitting it is painful.

---

## 11. User journey

### Day 0 — first open (4 min)

Name picker, no email, no password → *"Hast du schon Deutsch gelernt?"* → No →
A1.1 (Yes → 15-question placement quiz) → daily goal 30/60/90, default 60 →
one screen of expectation-setting → straight into Unit 1.

### Day 1 — first session (~45 min, short on purpose)

No reviews yet: 12 words (hallo, tschüss, ja, nein, ich, du, sein, heißen,
danke, bitte, gut, Name) → grammar `ich bin / du bist` → 3-minute A1.1 video →
say "Ich heiße …" aloud → 3-turn AI conversation using only those 12 words →
8-question quiz.

Ends with: *"You learned 12 words and can now introduce yourself in German.
Tomorrow: these 12 come back, plus 12 more."* That line sets up the return
visit and matters more than it looks.

### Days 2–7

Reviews accumulate — 12 due on day 2, ~45 by day 7. The session reaches its
full ~60-minute shape around day 4. By day 7: ~70 words, introductions,
numbers, ordering a coffee.

### Week 4 — first exam

A real Goethe A1 Modellsatz section, scored honestly. It gates nothing — a
mirror, not a test.

### Month 3 — the shift

Around A2.2 it stops feeling like drills. Reading becomes short real articles,
conversations run 10+ turns, the AI starts explaining grammar *in German*.
The UI language toggle unlocks here if you want it.

### Month 6 — B1.2

All 2,400 words, all 60 grammar points, full Modellsatz practice runs.

---

## 12. Architecture

```
Next.js 16 (App Router) + Tailwind 4          ← 15 + shadcn/ui as planned
  ├─ /app/api/*          route handlers — the only server code
  ├─ SQLite (node:sqlite)        one file, GITIGNORED   ← not better-sqlite3
  ├─ /public/audio/*     pre-generated ogg, 37 MB
  └─ /data/*.json        seeded curriculum, in the repo
```

Two corrections to the plan, both deliberate:

**`node:sqlite`, not better-sqlite3.** It ships inside Node 24, so there is no
native module to compile. `npm install` cannot fail on a missing build
toolchain, which is the single most common way a clone-and-run repo stops being
clone-and-run.

**The database file is gitignored, not committed.** The spec's own §10 splits
content from progress; committing the db would commit both, and one person's
review history is not the other's. Content rebuilds from `data/` with
`npm run setup`, so nothing is lost by leaving it out.

Also dropped: **shadcn/ui**. Plain Tailwind. Every component here is either a
one-off or shared through `src/components/`, and a component library would have
been a dependency carrying opinions this app already has.

Runs with `npm run dev`. That is a valid deployment for two people. Deploy to
Vercel + Neon (both free) when the roommate wants it on their phone.

**Not used:** FastAPI, Postgres, pgvector, Qdrant, Redis, Clerk. Five deploy
surfaces for two users is how side projects die.

### Speech: browser APIs first, not Python

The decision that keeps deployment trivial.

| Need | Choice | Why |
|---|---|---|
| Speech → text | Web Speech API (Chrome) | Free, no server, German works well, runs on the roommate's phone |
| Text → speech (dynamic) | `SpeechSynthesis` API | Free, instant, fine for throwaway sentences |
| Text → speech (curriculum) | **Piper, pre-generated to mp3** | Consistent, static files, works offline |
| Native word audio | Wikimedia Commons | Real German speakers, ~85% coverage of A1–B1 |

Move to `faster-whisper` only if Web Speech accuracy actually disappoints. A
Python sidecar means no Vercel deploy and no phone access — pay that cost
against measured evidence, not a guess.

### Model routing

There are **three** categories, not two — the third is the one that matters
most for cost over time.

| Category | Job | Model | Stored? |
|---|---|---|---|
| **Build time** | Mnemonics, example sentences, grammar explanations, scripted offline dialogues, the top ~200 error explanations | Opus 5 / Sonnet 5, **Batch API (50% off)** | ✅ committed to the repo |
| **Write-through cache** | Novel error explanations not in the pre-built table | Haiku 4.5 | ✅ **written back to `error_pattern`** |
| **Pure runtime** | Conversation, writing correction, Ask Tutor | Sonnet 5 + prompt caching | ❌ genuinely per-user |

**Spend once with the best model, serve from SQLite forever.** Cheaper *and*
higher quality than calling a cheap model live.

### The write-through cache is why costs decay

When you make a mistake nobody has made before, the app pays for one live
explanation — then **saves it**. The next time you make that mistake, or the
first time your roommate does, it's free and instant.

German learners make a *finite* set of mistakes. Within a few weeks the
`error_pattern` table covers nearly everything either of you does, live calls
drop toward zero, and that line of the monthly bill quietly dies. Only
conversation and writing correction stay genuinely per-user forever.

Design consequence: the error-explanation path must **always write its result
back**, never just return it. A cache that doesn't fill is just a slow API.

---

## 13. Cost

**One-time content build ≈ $13:**

| | |
|---|---|
| 2,400 words × (mnemonic + 2 examples + mistake note), batched | ~$4–9 |
| 60 grammar explanations | ~$2 |
| 200 recurring error patterns | ~$2 |

**Monthly runtime, 2 users ≈ $7:** conversation ~$3.30 · writing ~$1.10 ·
novel errors ~$2.20.

⚠️ Sonnet 5 is at introductory pricing ($2/$10 per MTok) **through 2026-08-31**;
after that $3/$15, pushing runtime to roughly **$9/month**. Plan against $9.

Everything else is $0: SQLite, browser speech, Piper, YouTube embeds, Commons
audio, Goethe Wortlisten, Wiktextract, Tatoeba.

---

## 14. Free content sources

| What | Source | Licence |
|---|---|---|
| Curriculum spine | Goethe Wortlisten A1 / A2 / B1 | Free PDFs |
| Articles, plurals, IPA, conjugations | Wiktextract (kaikki.org) | CC BY-SA |
| Native pronunciation audio | Wikimedia Commons (`De-*.ogg`) | CC |
| Example sentences DE↔EN | Tatoeba | CC BY 2.0 FR |
| Sentence TTS | Piper / Kokoro, run locally | MIT / Apache |
| Graded listening + transcripts | DW *Langsam gesprochene Nachrichten*, `nachrichtenleicht.de` | link / embed |
| Video course A1→B1 | DW *Nicos Weg* | free, embeddable |
| Level-labeled lessons | *Your German Teacher* (A1.1, A2.1 …) | YouTube embed |
| Real spoken German | Easy German | YouTube embed |
| Practice exams | Goethe Modellsätze | free PDF + audio |

**Videos: embed only.** The YouTube IFrame Player API is the legitimate path and
it's also the better one — it lets you seek, loop a single sentence, and change
speed from your own code. Do not download, rip, or re-host.

---

## 15. Three things that will bite you

### 1. The content prep tax is the real work

Each unit needs ~12 minutes of *human* time: pick the video, mark sentence
timestamps, sanity-check the grammar explanation, write the scenario brief.
120 units × 12 min = **24 hours**. Not optional, not automatable without the
quality collapsing.

**Build units one week ahead of yourself, not six months.** Prep Sunday
evening, ~90 minutes. Your later units then get built by someone who actually
knows some German, which makes them better.

### 2. Missing days is what kills SRS apps

Take a 5-day trip, return to 300 due cards, feel awful, never open it again.
The single most common death of every Anki-style app.

**Design for it on day one:**
- Hard cap reviews at 60 per session regardless of backlog.
- Prioritize by *overdue ratio*, not raw due date.
- After a gap ≥3 days, show a **Wiedereinstieg** session: 20 reviews, no new
  material, ~15 min, and say explicitly that the backlog is handled.
- The streak allows 1 rest day per week without breaking.

### 3. Building the app will eat the study time

A1.1 → B1.2 is 350–400 hours. Building this is 100+ from the same budget. The
likely failure isn't technical — it's month 2 spent refactoring the scheduler
while your German goes nowhere.

- **Study first, build second.** Every day.
- Timebox building to 45 min/day after week 1.
- Keep `FRICTION.md` — one line every time studying annoys you. That file is
  your only backlog. Never build from imagination.

---

## 16. Build order

**Day 1 — the spine.** Scaffold, schema, seed script (Goethe A1 Wortliste +
Wiktextract + Commons audio), vocab review screen with `ts-fsrs`, one
`/api/chat` route.
*End of day: 650 real words with native audio and correct spacing — genuinely
studiable.*

**Days 2–4.** Session runner (the block engine) · sentence builder + error tags
· listening drill · Wortschatz browse section.

**Days 5–7.** Grammar module with the first 12 A1 points · writing correction ·
dashboard · Units 1–5 prepped.

**Week 2.** Full A2 + B1 Wortliste import (→ 2,400 words) · the batch
content-generation run (the $13) · AI conversation with the vocabulary
constraint · video player with segment looping.

**Week 3.** Speaking · reading · Wiedereinstieg mode · first Modellsatz.

**Week 4+.** Build only what `FRICTION.md` says. Nothing else.

---

## 17. Offline-first

**Design rule: a complete daily session must be finishable on a train with
airplane mode on.** If the API budget runs out or the wifi dies, you still study.

This is nearly free given the architecture — SQLite, pre-generated Piper mp3s,
Commons audio, and browser `SpeechSynthesis` are all local already. What it
takes is *discipline in the session runner*, not new infrastructure.

| Feature | Offline? |
|---|---|
| Vocabulary SRS, Wortschatz, grammar, sentence builder, listening, reading, quizzes, recap, progress | ✅ fully |
| Speaking | ✅ Web Speech works offline in Chrome for common languages; falls back to record-and-compare |
| Video | ❌ needs YouTube — swapped for an audio drill |
| AI conversation | ❌ — swapped for a scripted branching dialogue built from the unit's scenario |
| Writing correction | ⚠️ write offline, **queue it**, correct on reconnect |

Three concrete requirements:

1. **The session runner never dead-ends.** If `navigator.onLine` is false or a
   call fails, it silently picks the offline variant of the block. No error
   modal, no empty screen.
2. **Deferred correction queue.** Writing submitted offline goes into a local
   queue and is corrected the next time you're online. The recap says so.
3. **Every unit ships one scripted dialogue** alongside its AI scenario — a
   small branching tree generated in the same batch run. This is the offline
   stand-in for conversation, and it costs nothing extra because it's generated
   once with everything else.

**Scope note.** Offline is free *today* because the app runs on your laptop with
a local SQLite file. True offline on your roommate's **phone** is a different
thing — it needs a PWA with a service worker, content cached to IndexedDB, and
progress sync on reconnect. That's roughly a week of work. Build the session to
be network-independent now (free, and correct); defer the phone PWA until
someone actually wants it.

---

## 18. Pronunciation, honestly

The instinct to replace "87% accurate" with a per-sound breakdown is right —
but it has to be *derived from real data*, not invented, or it's the same
mistake in nicer clothes.

**What is not possible:** a genuine `sch ✓ / ch ✗ / ü ✗` phoneme heatmap from
Web Speech or Whisper. Both return **words**, not phonemes. Real phoneme scoring
needs forced alignment (Montreal Forced Aligner) plus an acoustic model, or a
paid service. Fabricating per-sound scores on top of word-level output would be
exactly the invented number this spec exists to avoid.

**What is possible and genuinely useful:** aggregate the words the recognizer
misheard, then group them by the sounds they contain.

```
        Aussprache — letzte 30 Tage

        ü    über · für · müde · Bücher      4 / 11 erkannt
        ch   ich · nicht · Küche             9 / 12 erkannt
        sch  schön · Schule · Tisch         14 / 14 erkannt   ✓

        → Übe heute: ü
```

Every number there is a count of things that actually happened. Same insight,
same actionability, zero fabrication. It needs one static map of
`grapheme → words containing it` (~15 German sound patterns, written by hand in
an hour) and a `GROUP BY` over your speaking attempts.

**If you later want true phoneme scoring**, Azure's Pronunciation Assessment
API does it properly and has a free tier. Note the trade-off: it's a cloud
dependency, which conflicts with §17. Not worth it before you've used the
derived version for a month.

---

## 19. Rejected: a "Real Life" navigation tab

Ten scenario bundles (restaurant, doctor, bank, Bahnhof, …) as a sixth top-level
tab was proposed and **declined**, for two reasons:

1. **It contradicts the core thesis.** The product is one button and no
   decisions. Going from four navigation targets to six adds decisions to the
   exact surface where they were deliberately removed.
2. **The content already exists.** Every unit ships a scenario. Rebuilding
   restaurant/doctor/bank as standalone bundles with their own vocab, listening,
   quiz, and cultural notes duplicates unit content at ~12 min prep each.

**Kept instead, at near-zero cost:** a *Szenarien* filter inside Practice that
lists every scenario across all units, so you can replay "Im Restaurant" any
time. Same access, no new tab, no new content pipeline, no new decisions on the
home screen.

---

## 20. What the build changed

This spec is the plan, written before the code. It has not been rewritten to
match what got built, because a spec quietly edited to agree with the
implementation stops being useful — you can no longer tell a decision from a
drift. What follows is the diff.

Everything below was **added or changed after the fact**, with the reason. The
rest of the document still describes the app.

### §3 Session structure — four changes

| Change | Why |
|---|---|
| Blocks 2 and 5 each split into several | *Fix* became **Fix · Lücken · Grammatik-Wdh.**; *Output* became **Sprechen/Schreiben** and **Gespräch** as two slots, not one. A session is 4–10 blocks, not 6 — and block 1 is absent entirely when nothing is due, which is every day of the first week. |
| Speaking gets two output days in three | The spec listed speaking, writing and conversation as one rotating slot, which gave speaking a third of days. It is the skill self-study destroys, and the only one that costs nothing per use — Web Speech is in the browser, writing correction is a model call. The free skill was the rationed one. |
| Old readings and scenarios come back | Words and grammar were on a forgetting curve; situations were one-and-done. A scenario is the slowest thing here to build and the fastest to lose. Every third conversation and every other reading is one from a unit finished over a week ago, labelled with its origin. |
| A short session exists | `?kurz=1` runs blocks 1–2 only. Not in the spec; added because the alternative to a bad-day escape valve is a broken streak. It can legitimately be empty. |
| The recap names tomorrow | §4 forbids a bare unit number and the recap was showing "Unit 15". It now shows the unit's title. |

Also corrected in passing: §3's recap mock-up shows *"Hören 92% · Sprechen
81%"*. Those numbers are not in the recap payload and never were — per-skill
accuracy lives on Fortschritt. The four real ones are minutes, new words,
reviews, and today's overall correct rate.

The rotation logic lives in `src/lib/rhythm.ts` as a pure function, so a month
of it can be walked in a test. It was `dayIndex % 3` expressions inline until a
test tried to check them and could not — the day index comes from the wall
clock, so nothing outside could observe more than today.

### §8 The vocabulary constraint — extended

The whitelist is as specified. What was added: the tutor is also told **what
this learner keeps getting wrong** — three error tags and four lapsing words,
from the same queries that already drove the Fix block — and told, three
separate times, never to mention them. A model handed "they confuse der and
den" will try to help by explaining it, which is exactly what the conversation
block must not do; corrections run afterwards for that reason.

### §12 Model routing — one addition, one correction

The three-category routing holds. Added: **every call now states its thinking
setting explicitly.** Sonnet 5 thinks by default when the parameter is omitted,
so a two-sentence café reply was paying for a reasoning pass at output rates.
Conversation and review run with thinking off at low effort; writing correction
keeps adaptive thinking, being rare and worth accuracy.

Correction to the caching claim: prompt caching does **not** start working on
day one. The minimum cacheable prefix is 1024 tokens and a beginner's whitelist
is a few dozen words, so the breakpoint does nothing for roughly the first
month. It does not error — it silently does not cache. The measured share is on
`/fortschritt`.

### §13 Cost — the ceiling is now enforced

The spec planned against $9/month and had no mechanism. There is one now:
`DEUTSCHMATE_BUDGET`, $5 per learner per rolling 30 days, checked **before every
paid call**. Past it, the app takes the same path it takes with no API key at
all — which already existed and was already tested (§17). A budget nothing
enforces is a wish.

### §10 Data model — no schema change *for the above*

None of the changes in this section added a table or a column. The milestones
on Der Weg, the recycling rotation, and the tutor's memory are all derived from
rows that already existed for other reasons. Nothing is written when a
milestone is "earned", so there is no second source of truth to drift from the
facts, and a restored backup shows the same history.

**§10 itself, however, is out of date.** Six tables in the running schema are
not in it: `reading`, `cloze`, `exam_run`, `explanation`, `pending_correction`,
`usage`. Columns drifted too — `error_pattern` is keyed by `signature`, not
`trigger_regex`; `unit` gained `can_do_json` and `dialogue_json`; `grammar`
gained `drills_json`. **`src/lib/schema.sql` is the source of truth**, and it
is commented.

### §7 Mastery and unlocking — both rules built, one of them split in two

Both were unbuilt for a long time. They are built now, and one of them had to
change shape on the way in.

**"A unit completes at ≥80% of its words learned AND grammar ≥70"** — built,
but as *two* states rather than one, because the rule as written breaks the
course. `currentUnit()` returns the first unit that is not complete, so a
retention threshold on completion parks the learner on unit 1 for the fortnight
FSRS takes to reach `state = 2`: no new words, no new grammar, nothing but
reviews. That is the exact week people quit in.

So:

| | |
|---|---|
| **complete** | every word introduced. Coverage. Drives progression, because showing up must never stall. |
| **mastered** | ≥80% of those words learned *and* the grammar point solid — the spec's threshold, unchanged. Retention. Drives what the app **says** about you, never what it lets you do. |

Retention is still enforced, just not by a gate: the forgetting curve brings
words back whether or not the unit is behind you, and `newWordBudget()` already
cuts the daily intake from twelve to six when the week is going badly.

Mastery is **computed, never stored**, because it goes down — one lapse drops a
card out of `state = 2`, and a stored status would be a claim about the past
rendered as a claim about the present. Der Weg draws three tick states now:
solid for mastered, faint for finished-but-drained, and a `N sitzen` count per
level. `src/lib/mastery.ts`.

**"A unit unlocks when its prerequisites are complete"** — built, and worth
being exact about what it buys, because it is easy to oversell. Every unit
requires exactly the one before it and units can only be completed in that
order, so "first unit whose prerequisites are met" and "first unfinished unit"
are provably the same unit. **The check changes no outcome today.** What it
buys is that `prereq_json` is no longer 120 rows of correct data that nothing
reads — a trap for whoever touches this next — and that if the data and `ord`
ever disagree, the data wins.

Two safety rules came out of building it, both from a test that caught the
first version handing a beginner the last unit of B1.2:

- an unmet prerequisite on a **linear** chain blocks everything downstream, so
  when *nothing* is available the walk retries ignoring prerequisites. Bad
  content data must never be able to end someone's course.
- a prerequisite naming a unit that does not exist is **ignored**, not treated
  as unmet. A one-character typo must not silently change the curriculum.

Also in §7: **grammar mastery is not a rolling accuracy**. It is a card-state
count — `reps >= 3 AND state = 2`, the same definition vocabulary uses, and now
the same one mastery uses. Three different meanings of "learned" would have
been worse than one imperfect one.

### §11 · §14 counts

**36 grammar points, not ~60.** §6 and §13 both say sixty; thirty-six were
written, they cover A1.1 → B1.2, and 44 units teach one. The cost line that
budgeted "60 grammar explanations ≈ $2" was correspondingly generous.

### §19 — the tab was rejected, the content was built anyway

§19 declined a "Real Life" nav tab and kept a Szenarien filter instead. The nav
is still four, so the letter holds. But `/alltag` now ships six standalone
survival bundles with their own phrases and Mitbringen checklists — precisely
the duplication §19 argued against — reachable from Üben rather than the nav,
alongside `/nachrichten`, `/unterwegs`, `/aussprache` and `/text`.

The reasoning that survived: **no new top-level decisions.** The reasoning that
did not: **no new content pipeline.** Worth saying plainly rather than leaving
§19 reading as though nothing happened.
