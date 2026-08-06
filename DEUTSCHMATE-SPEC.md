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
> - a session is **5–10 blocks**, not 6, and old scenarios and readings now come
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
word(id, lemma, article, plural, pos, en, level, topic,        -- no `ipa`, see §21
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
user(id, name, level, created_at)      -- no goal or batch columns, see §21
card(id, user_id, ref_type, ref_id, due, stability, difficulty,
     reps, lapses, state)                            -- FSRS state
attempt(id, user_id, kind, ref_id, correct, user_answer,
        error_tags_json, created_at)
unit_progress(id, user_id, unit_id, status, completed_at)
word_seen(user_id, word_id, seen_at)   -- was browse_progress, see §21
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
| Blocks 2 and 5 each split into several | *Fix* became **Fix · Lücken · Grammatik-Wdh.**; *Output* became **Sprechen/Schreiben** and **Gespräch** as two slots, not one. A session is 5–10 blocks, not 6 — five always run once you are inside a unit, and the other five appear only when there is something to do. Block 1 is absent entirely when nothing is due, which is every day of the first week. |
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

---

## 21. The cosmetic audit

One feature turned out to be **cosmetic**: `/alltag` passed ids like
`surv-anmeldung` to the conversation route, which looked them up in the `unit`
table, found nothing, and fell through to "a friendly German speaker having a
short chat". All six briefs rendered perfectly beside a conversation that was
not theirs. Nothing errored. It survived a full read of the page.

That failure has a shape — *correct-looking output over a disconnected
mechanism* — so the whole app was swept for it. This section is what the sweep
found, because a list of near-misses is more useful than a claim of quality.

### Mechanisms that were not connected

| | |
|---|---|
| **"✓ geführt" on /ueben** | Read `attempt.ref_id` for conversations. The chat route logged those rows without a `refId`, so the column was NULL for every conversation ever had, the set was permanently empty, and all six level headers read "0 / 20 geführt" forever. A flawless conversation logged nothing at all — rows were written per *correction* — so the one outcome worth celebrating left no trace. Both fixed. |
| **"Text gespeichert · die Korrektur kommt, sobald du wieder online bist"** | A plain `fetch`. Offline it rejected, the catch set the flag, and the screen confirmed the saving of eighty words that had just been dropped. The server's queue only ever received texts submitted while the network was up. It goes through the outbox now. |
| **The drain for that queue** | `GET /api/writing` — "drain the offline queue once we're back online" — had no callers anywhere in `src/`. Rows accumulated permanently under a banner promising they'd be checked. It is called from /ueben now, and shows the corrections rather than silently resolving them. |
| **"Z zurücknehmen (5 s)"** | The grade was POSTed the moment the button was pressed; take-back only re-queued the card locally. Answering again graded it a *second* time — two attempt rows, two steps of the curve. The send now waits out the undo window, which is the only reading of the word that is true. |
| **"Esc Beenden"** | Printed in the session header and listed in the shortcut sheet. No Escape listener existed. |
| **The corpus rotation** | `id > 'tat-' + (dayIndex % 36)`, commented "walks the whole corpus over time instead of replaying the first rows". The modulo made day 36 identical to day 0, and Tatoeba ids are skewed — 941 of 1,827 start with `tat-1`. Measured over the 210-day course: **105 of 1,827 sentences at B1.2**, final by week five. Now an offset window: 92% at B1.2, 100% at A1.1. `tests/corpus.test.mts` measures coverage rather than checking that two days differ, which the broken version also passed. |
| **Three localStorage keys** | `/wer` says, in as many words, "nothing is shared between learners except the course itself". The saved session, the cached plan and — worst — **the queue of ungraded answers** were global. Switch learner mid-queue and one person's reviews replayed into the other's deck, under whichever cookie happened to be set when the network returned. Keys are scoped by learner now (`src/lib/who.ts`), replays are stamped with the learner who answered, and a pre-existing queue is adopted rather than orphaned. |
| **"gemischt" on /aussprache** | Linked to `?laut=alle`, which is not a known sound, so it fell through to the auto-picked weak one. On a new account there is no weak sound and it happened to give the mixed spread — so the chip broke only once you had enough data for the page to have an opinion. |
| **Two copies of the sound map** | Each commented "the same map the other one uses", already drifted: /fortschritt could name "eu / äu" as your worst sound while the drill had no way to open on it. One copy now, in `lib/pairs.ts`, containing only sounds that have drills. |

### Claims that were false rather than disconnected

- **Home: "Morgen: Unit 15."** §4 forbids a bare unit number and the recap
  already obeyed it. Home did the arithmetic itself — and `ord + 1` is also
  wrong at a level boundary, where the next unit's ord resets to 1.
- **Home: "Nur 20 Minuten heute · Wiederholen · Fix · Lücken."** Both halves
  hardcoded, both wrong: the short session is up to four blocks and nearer 28
  minutes, and which blocks appear depends on what is due. It now states the
  rule that actually defines the shape — nothing new, only what decays.
- **"Offline — Ersatzübung statt Video."** No video has ever been imported.
- **"gesehen" on /fortschritt**, the first headline stat, directly above a
  paragraph insisting the counts are honest: a running total incremented by the
  page size with no deduplication. Paging back and forward re-counted; it could
  climb past the 2,400 words that exist. `browse_progress` is replaced by
  `word_seen`, one row per word.
- **"✓ im Deck"** reverted to "+ Deck" on the next page turn — the badge tested
  `reps > 0` and the button creates the card with `reps = 0`. Re-clicking also
  reset the card's schedule to today, discarding weeks of it.
- **"gelernt · 3+ Wdh., letzte 2 richtig."** The query is `reps >= 3 AND state
  = 2`; FSRS review state says nothing about the last two answers.
- **Walk mode** wrote `correct = 1` unconditionally and the accuracy chart drew
  it as a permanent **"exposure — 100%"** bar, in English, because the label map
  had no entry. It is a count in a sentence now, not a bar.
- **"Häufiger geworden · 0× → 3×"** for a mistake with no history. The filter
  meant to require history on both sides was `||`, always true.

### Dead columns, removed rather than left as traps

`word.ipa` — NULL for all 2,400 words, rendered on `/wort`, nothing in the repo
produces it, and 2,373 of those words have a native recording. `daily_goal_min`
and `browse_batch_size` — both defaulted, neither editable anywhere, neither
obeyed. `word.mnemonic` was on this list too; instead of removing it, it is now
generated on demand for leeches and stored on the shared row, so the second
person to hit the same wall gets it free.

### A second pass, from a screenshot

The sweep above read code, data and wiring. It could not have found what a
photograph of the screen found in a second: a button reading **Let&amp;apos;s
go**, on the last step of the tour, the moment before a first-time user starts.

JSX decodes HTML entities in text and does **not** decode them inside a string
literal. `<span>Let&amp;apos;s go</span>` is right; `{cond ? "Let&amp;apos;s go"
: "Done"}` prints the ampersand. Same six characters, same file, a few lines
apart, opposite answers — and the lint rule that asks for the entity applies
only to the first case, so the habit gets learned somewhere it is required and
carried somewhere it is wrong.

A scan of every string literal in `src`, `data` and `scripts` found exactly one.
`tests/strings.test.mts` keeps it that way, and asserts its own detector can
still tell the two cases apart, because a check that cannot go red is
decoration.

Then every route was fetched and its **rendered text** read — not its source —
looking for stray entities, `undefined`, `NaN`, `[object Object]`, mojibake and
empty pages, at desktop and at 375px. Nothing else came back. What did come back
were two stale claims in the tour, which is the app's longest piece of prose and
therefore the place a claim goes wrong most quietly:

- *"Twenty minutes beats zero"*, telling you to look for a button labelled **Nur
  20 Minuten** — a label that had stopped existing an hour earlier, when that
  same button was corrected for saying twenty minutes about a session nearer
  twenty-eight. An instruction pointing at a control that is not there is the
  worst kind: it reads perfectly.
- *"One button, then six to nine blocks"*. Five always run once you are inside a
  unit; ten is the ceiling. §3 above said 4–10 and that was loose too.

### A third pass, from using it

Reading the code found disconnected mechanisms. Reading the rendered HTML found
a raw entity. Neither of them can find what only appears when you sit down and
do an hour of German, so that happened next: a throwaway learner on `/wer`, the
tour, a full session — twelve new words, eight dictations, a sentence built, a
conversation, an eight-question quiz — the recap, and then every page that now
had numbers on it.

**The recap reported that the session had not happened.** 0 Minuten · 0 neue
Wörter · 0 Wiederholungen · 0 %, under a heading saying "Heute geschafft", with
the database holding all of it correctly. The counters animate up from zero with
`requestAnimationFrame`, and a browser does not run rAF in a background tab — so
finish a session, lock your phone or switch tabs before the recap paints, and
the numbers never leave zero. Permanently: the effect has already run.

The code's own comment calls this "the screen that decides whether you come back
tomorrow". A timer now lands the final value whether or not a frame is ever
drawn; the animation is decoration over a number that arrives regardless.

**The conversation tracker was still broken, one commit after being fixed.**
§21 above records adding the unit id to the conversation review call. That is
the *live* path, and the live path needs an API key — so with no key, which is
the state the app ships in, every conversation still logged nothing and
"N geführt" was still permanently 0. The scripted fallback, the only path that
runs today, was never touched. Half a fix is indistinguishable from a whole one
until someone uses the thing.

Also found by using it, each small and each visible on the first screen it
appears on:

- **`dieEntschuldigung`.** The article's gap was a CSS margin and not a space,
  so it looked right and copied wrong — and a screen reader said it as one word.
- **`1 Wörter`, `1 Karten fällig`, `1 Regeln sind eingeführt`, `1 Sitzungen`.**
  Correct for every value except one, on an app whose subject is the language it
  is getting wrong. `lib/plural.ts`, including verb agreement, because fixing
  only the noun leaves "1 Regel **sind**".
- **`Wrong word chosen`** on Fortschritt, under a German heading, next to German
  bars — while the recap called the same tag `Wortwahl` one click earlier. There
  were **three** copies of the tag names: English in errors.ts, and a different
  German map each in SessionRecap and ClozeBlock, neither aware of the four tags
  added with the prebuilt explanations. Now `lib/tags.ts`, which imports nothing
  so client components can use it, with DE for the interface and EN for prompts.
- **`Zeit — 0 h in 30 Tagen`** after a session you had just finished. True about
  hours; reads as "you have done nothing", on the page for showing that you have.

**Z on the last card.** Found in the same pass and initially left alone, then
fixed: the footer advertises the undo on every card and it worked on all of them
but the one people most often fumble — the last, when you are already reaching
for what comes next.

The obvious fix, delaying `onDone()` by five seconds, buys the promise at the
price of a dead pause at the end of every review block. So the block ends **on a
card instead of on nothing**: the word you just graded, still takeable back, with
Weiter under it. Press Weiter or Enter and you leave at once; ignore it and the
window closes by itself and the session moves on. The stall only exists for
someone who was going to stop and look anyway.

`closing` is derived — `queue.length === 0 && undo !== null` — rather than
stored, so the timer clearing `undo` is the same event that advances the block,
and there is no setState cascade in an effect.

`tests/undo.test.mts` pins the fact underneath it, which is about rows and not
about a render: one grade writes exactly one attempt row and takes exactly one
step of the curve. It keeps the old bug in as a live demonstration — two sends
really do write two rows — because that is what the take-back used to produce.

### Things that are empty but honest

`video` has no rows, and the session only offers a video once it has
hand-marked segments, so nothing pretends otherwise — `/admin/video` is the tool
for adding them. `topic` covers 6% of words, and the filter chips are built from
the topics that exist, with counts.

`error_pattern` was on this list. It is not any more — see §22.

---

## 22. The prebuilt error patterns

§12 planned "~200 prebuilt error patterns" and none were written. The reason is
worth recording, because it was not laziness: **there was nothing sensible to
write.** The cache is keyed on `expected|got` — the exact sentence and the exact
wrong answer — and you cannot enumerate in advance the sentences a learner will
meet. Two hundred rows against that key would have been two hundred correct
explanations that never once fired. Spec §21 exists because that is the app's
characteristic failure, so building it that way would have been building the
thing this project has spent a week removing.

### A mistake now has two keys

| | | |
|---|---|---|
| **sentence** | `ich sehe den mann\|ich sehe der mann` | learned, exact, written back from a live call |
| **pattern** | `w:der→den` | prebuilt, general, written by hand |

The pattern key is the *difference*, not the sentences, so the same slip in a
hundred different sentences is one row. `src/lib/error-key.ts` decides what
counts as the same mistake:

- one word differs, and it is a closed-class word → `w:wrong→right`
- one word differs by a real verb ending on a shared stem → `v:-e→-st`, so every
  regular verb in the language shares one entry
- only the capital changed → `case`; only an umlaut → `sp:umlaut`
- the same words in a different order → `order:verb-position-2`
- four words differ → **null**. Two sentences that disagree in four places have
  no single lesson in them, and inventing a key for that would mean serving a
  stored explanation of a mistake nobody made.

Contracted prepositions fold to the preposition inside them, so *nach Arzt* for
*zum Arzt* reaches the entry about nach and zu rather than dying on `w:nach→zum`.

**The rule the file enforces**: a pattern explanation must be true without
seeing the sentence. That is why live model output is still stored under the
sentence key only — it says things like *"'Mann' is masculine"*, which would be
a lie the moment it was reused on a sentence about a Frau.

### What is in it

`data/error-patterns.json` — **249 entries, 955 signatures** after the
conjugation cross-product. Articles and case (48), the perfect auxiliary (15),
verb endings by ending and the strong-verb stem changes (45), negation (10),
pronouns (20), prepositions (22), confusable words (60-odd pairs, most of them
registered in both directions), the structural keys, and **one last-resort row
per tag** so the offline path gives a rule rather than a bare label.

Four tags were added to carry them, because the classifier could not previously
name what was wrong: `article-dativ`, `article-genitiv`, `perfekt-hilfsverb`,
`praeposition`. Before this, *mit der Mann* was reported as a gender mistake
when the gender was right and the case was not.

### What the test measures

`tests/error-key.test.mts` drives **41 wrong answers a beginner actually
produces** — *Ich sehe der Mann*, *Er hat nach Hause gegangen*, *Ich kenne es
nicht*, *Ich habe sehr Arbeit* — and fails unless every one of them reaches a
specific explanation. That check found four things a row count never would:

- `ein→einen` was being keyed as a verb ending, because `ein` and `einen` share
  a stem and two short tails exactly like `gehe` and `gehst`
- `stehen→stellen` likewise, so the entry written about them never fired
- entries written about infinitives could not match conjugated forms — *kenne*
  is what a learner types, not *kennen*
- the seeder upserted and never deleted, so a reworded entry left its old key
  behind, unreachable

### What it changes

Most of what a beginner gets wrong is now explained **for free, offline, and
instantly** — no key needed, no budget spent, no round trip. `tests/why.test.mts`
asserts specifically that der/den, the commonest accusative slip in German,
never costs a model call: `rule` would pass a looser check while quietly
charging for it forever.

---

## 23. More than one person

The spec was written for one learner and a flatmate sharing a laptop, and §10's
data model had `user_id` on every progress table from the start — so multi-user
was always half-built. What was missing was everything around it: there was no
way to *become* a user, no way to pay for the AI half except the operator's own
env var, and several places where "this is safe" rested on an argument rather
than on the code.

Five steps, in order.

### 1–2. Accounts, and a door

`user` gained `email`; two new tables, `auth_token` and `session`. Sign-in was a
magic link: an address, a mailed link, a fourteen-day session. No password to
choose, forget, or leak, and no password column to be breached.

**Superseded by §26** — the link needed delivery, delivery needed SMTP, and the
whole apparatus existed to answer a question a password box answers directly.
The session half of this survived unchanged; the token half is gone.

`src/proxy.ts` redirects page requests with no session cookie to `/anmelden`.
(It was `src/middleware.ts` until Next 16 deprecated that convention — see §25.)
It runs in the edge runtime, which cannot load `node:sqlite`, so the cookie names
live in `lib/who.ts` — a module the edge can import — rather than in `lib/auth.ts`.

### 3. Config, not constants

Two files replaced a scatter of literals:

- **`data/models.json`** — the model catalogue: ids, prices, context windows,
  which model fills the `quality` and `cheap` roles, and the cache multipliers
  (1h writes are **2×**, not 1.25×). Dated and sourced. Changing model or price
  is a JSON edit, not a grep.
- **`lib/config.ts`** — every product number with the reason next to it. Twelve
  new words a day, sixty reviews, eight lapses to a leech.

`lib/env.ts` owns the environment: `check()` returns problems, `describe()`
reports presence and never a value, and `npm run config` prints both.

### 4. Everyone brings their own key

The course is free and runs on this machine; the four features that need a model
run on the learner's own Anthropic credential. This install's bill no longer
grows with the number of people on it, and nobody can spend anybody else's money.

Stored AES-256-GCM, keyed by `DEUTSCHMATE_SECRET`. The key is never returned to
a browser, never logged, never in a response — the settings page knows only the
last four characters. Every decryption failure returns null and produces the
same sentence, because distinguishing "wrong secret" from "corrupt row" only
tells an attacker which guess was closer.

**What it buys**: a database that leaves the machine — a mislaid backup, a file
copied off a box. **What it does not buy**: safety from someone who can read the
server's environment, because the key to decrypt is there.

One bug fixed along the way that had nothing to do with encryption: the
Anthropic client was a module-level singleton. Fine with one key in an env var;
a billing bug the moment there are two learners, because whoever called first
owned the cached client and the second person's request went out on their key.
Constructed per call now.

### 5. Correctness under two devices

The rest of the audit, which matters more once the same person is on a phone and
a laptop and the outbox can replay a session while a live one is running.

**Four read-then-write gaps**, and it is worth being exact about them rather
than claiming a scare. `gradeCard` read the card's FSRS state, computed the next
schedule, and *then* opened a transaction to write it. That is a lost update in
the general case — but this function is synchronous top to bottom and so is
`node:sqlite`, so **within one Node process nothing can interleave and no grade
was ever actually lost.** It is fixed because the gap becomes real the moment
there are two processes against one database file (a second instance, a worker,
a cron script — an ordinary thing to add), and because an `await` introduced
later would open it silently, in a diff that looked like it was about something
else. Same treatment for `introduceWord` and `introduceGrammar`, where the
stronger argument is atomicity: four statements that are only correct together,
and a throw between them leaves a card with no first rep.

`logSession` was a different shape. It returned the streak it had just
*computed*, while the `ON CONFLICT` branch deliberately leaves `streak_day`
alone — so on an upsert the returned and the stored number come from different
places. They agree in normal operation. They stop agreeing if today's row came
from a restored backup or an import. It reads the row back now.

**`tx()` was three bugs.** It used deferred `BEGIN`, so a transaction that read
before writing had to upgrade its lock mid-flight and got `SQLITE_BUSY`
immediately — a failure `busy_timeout` cannot help with, because waiting does
not resolve it. It threw on nesting, which made wrapping anything that already
transacted a landmine. And its rollback threw when no transaction was active,
replacing the real error with a confusing one. Now `BEGIN IMMEDIATE`, reentrant,
and a rollback that cannot mask what went wrong.

**Two writes without `AND user_id = ?`** (`UPDATE card`, `UPDATE
pending_correction`). Both were safe — each had an ownership check above it —
but safe by argument, and the argument lived twenty lines away.

### The shared cache needed a line drawn through it

§12 argues that the write-through cache is why costs decay: German learners make
a finite set of mistakes and read the same texts, so the second person to ask
pays nothing. That is still right. It was written when the only sentences
reaching the cache came from the curriculum.

Then `/text` let anyone paste any German they liked, and the whole sentence was
written verbatim into a table every account on the install reads from. People
paste letters from the Ausländerbehörde into that box.

So `explanation` now records **who asked** and **whether it may be shared**, and
`lib/shared-cache.ts` owns the decision:

- A sentence that occurs in the app's own content may be shared. Everything else
  is private to its author.
- The flag is set by the server, from the content tables — **never from the
  request**. A client asking to share is not evidence that the text is safe to
  share, and `tests/shared-cache.test.mts` asserts there is no parameter to pass.
- Matching is `instr`, not `LIKE`: a sentence containing `%` would be a wildcard
  and could match content it does not appear in. False positives publish someone's
  private text; false negatives only cache it per-person. The rule fails toward
  private, including a minimum of three words — "der" occurs in every text the
  app ships.
- Private rows carry their owner **in the key**. `signature` is UNIQUE, so
  without that the second person to ask about the same private sentence would
  collide with the first person's row, be unable to read it, and pay again on
  every ask, forever.

Mistake explanations stay global — a signature is two short answer fragments,
and an explanation of "der → den" is the right answer for whoever makes it next
— but they gained `created_by`, so a shared row has an author and can be
withdrawn.

Einstellungen states all of this in German, shows what you have contributed as
counts (never the text), and has two buttons: delete your own, or also withdraw
what you gave the shared pool. Withdrawing makes the app poorer for the other
people on the install, so it says so before you press it. **Prebuilt rows are
never in scope** — §22's 955 explanations shipped with the app and the offline
tier depends on them.

The migration that adds the column sorts what already exists: rows whose
sentence is app content are kept and marked shared, and the rest are deleted.
That is deliberate rather than tidy-up — they have no owner, the new lookup
cannot reach them, and they are the exact thing the column exists to prevent.

---

## 24. Email, video, and an audit of the above

> **The email half of this section is history.** §26 replaced sign-in links with
> a username and a password and deleted the mail subsystem entirely. Kept
> because the reasoning is still the record of why it was built, and because the
> three send-path properties below are the standard the replacement had to meet.

### Sign-in links can be emailed

Console stays the **default** — §17's clone-and-run promise means the app has to
work with no account, no domain and no network — and becomes one of three
transports beside SMTP and Resend. Filling in `SMTP_HOST` or `RESEND_API_KEY`
switches it on; there is deliberately no second switch, because a switch without
credentials and credentials without a switch are two ways to have mail silently
not send.

One dependency, nodemailer, for SMTP. Hand-rolling it over `node:net` is a few
commands, and the parts that go wrong fail *silently*: STARTTLS upgrade, AUTH
negotiation, RFC 2047 encoding of a subject with an umlaut, dot-stuffing a body
line that starts with a period. Each produces mail that vanishes or arrives
mangled while the app reports success. Resend needs no dependency, so it has none.

Three properties the send path holds:

- **A dead provider does not lose the link.** The failure is logged and the link
  still prints, so it can be handed over.
- **A dead provider does not leak who has an account.** Mail health is checked
  *before* the address lookup, so the 503 is true regardless of who asked. A
  failure *after* the lookup returns the ordinary success — "sending failed"
  would otherwise mean "this address has an account here".
- **The message does not phone home.** No image, no tracking pixel, no
  link-wrapping redirect, and the plain-text part carries the URL too: some
  clients render that one, and a link that exists only in the HTML is a sign-in
  that works for most people and mysteriously does not for one.

Sign-in links are throttled to one per address per minute, and the refusal is
indistinguishable from a send — "too soon" would confirm the address has an
account, which is exactly what the identical-answer rule above protects.

### Video: 231 episodes, and why they are not YouTube

Deutsche Welle's *Nicos Weg* is a free A1–B1 drama course from a public
broadcaster, already cut into ninety-second lesson-sized episodes.

YouTube reached 14 of them: playlist pages redirect to a consent banner from an
EU address, and the RSS feeds return only the newest 15 entries per playlist. DW
publishes the whole course as three official video podcasts — 226 episodes with
direct mp4s on their own CDN, episode and unit numbers in the filenames,
durations included. That is the source.

Better than YouTube on more than coverage: no Google script on a page a learner
opens daily, nothing reporting back what they watched, and less code — half of
`youtube.ts` exists to load an external API a `<video>` element does not need.
`lib/player.ts` puts one six-operation interface over both, because the handful
of extras DW does not put in the podcasts (the full films, the recaps) are still
YouTube embeds.

**Nothing is segmented, so the video block still never appears.** That is
correct, not broken: `session.ts` will not offer a video without hand-marked
segments, and an unsegmented file is a video rather than a lesson. A segment is
a timestamp plus the line actually spoken, and the only way to know the line is
to listen — generated transcripts would be subtitles that disagree with the
audio, which is worse than no video because a learner would believe them. The
editor takes a pasted DW manuscript and reduces the job to two keypresses per
line, which is the honest way to make it faster.

Unit assignment is left to a person too, beyond six exact title matches. DW's
"Einheit" is DW's course structure, not this app's twenty-per-level one, and
mapping 226 episodes onto 120 units by arithmetic puts the wrong video in a
lesson silently.

### The audit that followed

**§12's config file was lying.** Five of eighteen constants — `GAP_DAYS`,
`GAP_BACKLOG`, `GAP_CARDS`, `PACE_CUT_ACCURACY`, `CLOZE_PER_SESSION` —
documented decisions that were still hardcoded in `session.ts`. Editing config
changed nothing, and nothing errored. `tests/config.test.mts` now asserts the
connection itself: every exported constant must be imported by something.

`PACE_CUT_ACCURACY` needed care rather than a rewire. It is a fraction and the
code compares a percentage, so the obvious fix compares 74 to 0.8 and throttles
every learner permanently. It multiplies at the call site and the test pins that.

**Three rules had grown a second implementation**, all in `env.ts` — the file
created to stop exactly that. `budgetCeiling` duplicated `pricing.ceiling()`,
whose own docstring says the guard must not be able to disagree with the bar the
progress page draws; `adminEnabled` duplicated `trust.ts`; `serverApiKey`
duplicated an inline fallback in `apikey.ts`. Worse, `DEUTSCHMATE_URL` was read
in two places with *different* fallbacks, so the same account got links pointing
at different hosts depending on which screen asked.

**Two auth gaps.** The throttle above, and the session cookie deciding `secure`
from `url.protocol` — which reads "http:" behind any TLS-terminating proxy, so
the cookie ships without Secure on a site the browser reached over https. It
honours `x-forwarded-proto` now.

**Dead code.** `sameSecret`, a constant-time compare nothing called, deleted
rather than kept: an unused constant-time helper in an auth file implies the
comparisons there are constant-time, and a reader checking would find tokens are
looked up with `WHERE hash = ?`. Dead security code is worse than none.

### What the fourth pass found

§21 recorded three passes, each finding what the one before structurally could
not. A fourth — walking a full session in a browser — found one more:

The review block takes the whole screen and replaces the session chrome. The
chrome says "72 min übrig" for the session; the block said "≈ 2 min übrig" in
the same corner, in the same words, for the eleven cards in front of you. Both
numbers were right and one was **lying by placement**. It names what it counts
now.

The recap reconciles row by row — 9 Minuten, 12 neue Wörter, 20% richtig, 11
morgen — which is the same screen §21 caught reporting zeros.

---

## 25. Twelve scenarios, and what deleting the comments found

### Alltag doubles

§19 rejected a "Real Life" navigation tab and principle 5 later argued the
opposite about *content*: teach German through situations people actually face.
Six scenarios was the smallest thing that could test that. Twelve is the answer
to whether it was worth continuing, and the six added are chosen by recurrence
rather than by drama — **In der Apotheke**, **Krankenkasse anmelden**, **Paket
abholen**, **Aufenthaltstitel verlängern**, **Handwerker anrufen**,
**Nebenkostenabrechnung**. A1.2 through B1.2, each with phrases, the lines that
come *back*, and what to bring, and each with the scripted branching dialogue
that makes it work with no key and no signal.

Both content tests asserted `survival.length === 6`. Adding a scenario would
have failed them — a test that fails on the change it should be indifferent to
is measuring the wrong thing. They assert a floor and a duplicate-id rule now.
`surv-paket` also shipped with two items in `bring` where the test wants three,
which is the check doing its job.

### The comments came out

**19% of this codebase was comment**: 5,140 lines against 21,807 of code across
`src/`, `scripts/` and `tests/`, in 478 blocks of four lines or more. It is 6%
now — 1,810 lines in 190 blocks. Every block is its first sentence plus the one
sentence in the block that carried a warning.

Done with a script, then read back. 174 files is not a job for judgement applied
478 times, and a mechanical rule applied uniformly is auditable in a way that 478
individual decisions are not. Four notes went back by hand, each documenting a
bug already fixed once: `instr`-not-`LIKE` and the 12-character floor in
`shared-cache.ts`, the without-seeing-the-sentence rule in `error-key.ts`, and
the `×100` in `config.ts` that §24 already had to reason about.

One category of comment is load-bearing to a **machine**. Every test file's
header carries a `needs:` line and `tests/run.mts` parses it to decide whether to
start a dev server. Treating it as prose would have run eight suites against
nothing and reported green. Before any sweep like this: grep for code that reads
comments.

**What the sweep found, which is the point.** Deleting a comment means reading
the line beneath it against what the comment claims, one line at a time, across
every file. That is a code review nobody schedules. It found:

- **`who.ts` read a cookie nothing writes.** `userFromCookie()` looked for
  `dm_user`; sign-in moved to `dm_uid` in §23 and the reader was never updated.
  So the per-learner localStorage scoping §23 describes worked exactly as
  specified and scoped every learner to the same fallback name — one shared
  cached plan, one shared resume offer, one shared tour flag, and one shared
  queue of answers given offline, which is the one that corrupts a deck.
  Invisible on the install where it was written, because there the signed-in id
  *is* the fallback. `tests/who.test.mts` pins the cookie sign-in actually sets.
- **`TUTOR_CACHE_TTL` was named twice.** Its comment said "named once"; the call
  site four lines below hardcoded `"1h"`. The same failure as §24's five
  constants, in a file that had just been audited for it.

Both had a confident comment sitting directly above them. In both cases the
comment is *why* nobody looked at the line.

### Dead code, with the tool configured

`npx knip` reported 56 unused exports and 30 unused files, all of it noise: it
did not know `tests/` and `scripts/` are entry points, or that `tailwindcss`
arrives through a CSS `@import`. An analysis tool nobody has configured produces
a report nobody reads, which is indistinguishable from not running it.

[knip.json](knip.json) fixes that, and the real report was 20 findings. Deleted:
`unitMastery`, `unitStatus`, `tags.en`, and the compatibility re-export barrels
in `cloze`, `cost`, `errors`, `exam`, `accounts` and `user` that nothing had
imported. `db.ts` also lost three `eslint-disable` comments — `as never[]`
expresses what `as any[]` did without the escape hatch. Knip is empty now, which
is what makes the next finding meaningful.

### Read the log

Six thousand two hundred lines of dev-server output contained exactly one thing
worth acting on: Next 16 deprecating the `middleware` file convention. It had
printed on every boot for weeks and read as noise, which is what a warning looks
like right up until the version that removes it.

`src/middleware.ts` is `src/proxy.ts` exporting `proxy()`. Everything else about
it is unchanged, including the reason it imports from `who.ts` and not `auth.ts`:
it runs in the edge runtime, where `node:sqlite` does not exist.

### Tap targets

Measured at 375px rather than eyeballed: header links were **23px** tall, the
"← back" links **19px**, against the 44px both platforms recommend. `TAP` in
`src/lib/ui.ts` is an invisible `::after` that stretches the hit area without
moving the text — 48px and 44px now, with no layout change at any width.

Two places could not use it. The pair of links at the foot of Der Weg wrap onto
separate lines on a phone, so two overlays 13px deep would have overlapped and
one would have taken the other's taps; they have real padding. So does
`ReadingBlock`'s full-width button, where padding costs nothing. Verified across
twenty pages that no overlay covers another control.

The general rule: an invisible overlay is right for a link that is alone on its
line and wrong the moment two of them are close, and the difference is only
visible if you check. `lib/ui.ts` exports both shapes — `TAP` for a link on its
own line, `TAP_BLOCK` for a flex child where `inline-block` would break the
layout, which is what the tour's 4px step rail needed.

### A 401 took a page down

`/wortschatz` died with `Cannot read properties of undefined (reading 'map')`.

`fetch` does not throw on 401. The body parses cleanly, every field is
`undefined`, `setTopics(undefined)` lands, and the next render calls
`topics.map`. The route was already answering
`{"error":"not signed in","signIn":"/anmelden"}` — it had been telling the client
where to go since §23, and nothing was reading it.

Two things this is. It is §21's shape again: **valid JSON, wrong shape**, which
already took out `/fortschritt` once via an exam row. And it is a seam that only
opens on an expired session — the proxy redirects a signed-out *page* load, so
the only way to reach it is to be on the page when the session dies, which is
the fourteenth day and nobody's test.

`lib/http.ts` already had `arr()`, commented *"Guards `.map`/`.reduce` on a value
that isn't a list"* — the exact guard needed, unusable here because that file
imports `next/server`. So `lib/api.ts` is the client half: `getJson()` returns
null for a 401 (after following `signIn`), a non-ok status, a dead socket or a
body that is not an object, plus `arr()` and `num()`.

The failure state had to be honest too. "Keine Wörter gefunden" over a failed
request is a claim about the deck; the words are there and the server did not
answer. It says so, offers a retry that really refetches — a no-op `setState`
would not have re-run the effect — and shows "— gesehen · — gesamt" with no
pager rather than "0 gesamt · Seite 1 / 1", which are numbers about a list that
never arrived.

Swept the other eleven client fetches. Most already check `res.ok` or guard the
field. `/admin/video` did neither — no `.catch`, no status check, `d.videos`
straight into state — so the video editor would have gone down the same way.

### The dev server ran out of memory, and the app did not

It aborted at a **15.6 GB heap** after 5.7 hours, having served 88,969 requests
and compiled ten times — so not recompilation churn. 70,624 of those were
`POST /api/attempt`, which is what twenty-odd full test runs look like when
`progression` walks all 120 units each time.

The tempting conclusion is "dev servers leak, ignore it". §21's whole argument is
that the tempting conclusion is how a real fault survives a review, so it was
measured instead. Production build, `--max-old-space-size=192`, 15,000 attempt
POSTs in five rounds of 3,000:

```
baseline 103 MB → 224 → 226 → 226 → 227 → 228 MB
```

Flat, zero failures, 43–44 s per round throughout — no GC thrashing, no
degradation. Uncapped, the same load drifts to 322 MB, which is V8 declining to
collect while it has gigabytes of headroom. Given a reason, it collects and holds.

So: no unbounded retention in the request path, and a small box will not run out
of memory. The dev server still will, under a load no learner produces; restart
it. Recorded here because "we tested it for a week and it was fine" is not the
same claim as "we filled the heap and it held".

### Doing a session, again

The fifth pass in §24 was a session in a browser. Doing another one after all of
the above found four more, none of which any static check could see.

**The closing card lied twice.** "Die Bewertung ist noch nicht abgeschickt. Sie
geht raus, sobald du weitergehst" — while the same `UNDO_MS` timer committed it
and advanced the block five seconds later, whether you moved on or not. The Z it
offered stopped working at the same moment, with no countdown, while the
*in-block* undo had been showing "(5 s)" all along. It counts down now and says
what it actually does. Verified the whole loop: grade, Z inside the window, card
restored, and **zero** `/api/review` requests — the grade genuinely never left.

**"1 NEUE WÖRTER".** The recap did not inflect. `lib/plural.ts` already existed,
with `plural()`, `word()` and even `is()` for verb agreement, and `/woche` two
clicks away was using it correctly — the recap and the home screen just weren't.
An app that teaches German printing broken German is the same class of error as
a number that is wrong: the learner cannot tell which parts to trust.

**"Six conversations you will actually have"**, on a page rendering twelve. The
lead was typed; it is counted now. The list was also in insertion order, so an
A1.2 appointment sat below two B1.1 ones — sorted by level. Two more places
still advertised the original four scenarios by name.

**A German compound broke the layout.** "Nebenkostenabrechnung" at 30px is 356px
wide in a 327px box, so the newest scenario page scrolled sideways on a phone.
`globals.css` has had a `.break-de` class for exactly this since before the bug,
with a comment describing it — applied to review cards and walk mode, never to
the page headings that render content. It is on every heading that shows a word
from `data/` now, not just the one that broke.

### Two things found while checking the numbers above

Writing the "19% → 6%" line meant measuring both trees with the same script over
the same directories, which is the only honest way to state a ratio. Doing that
turned up two things nobody was looking for.

**131 of 179 source files were not prettier-formatted.** There was no config
file, so `prettier --write` had never been run over the whole tree — it was
formatted where somebody's editor happened to do it. The tree is uniform now,
and `.prettierrc.json` pins it so it stays a decision rather than a side effect
of whose editor last saved the file.

**Every `git add` printed a wall of "LF will be replaced by CRLF".** Harmless
until you run `prettier --check` on Windows, where every file then fails on line
endings alone and the real failures are invisible in the noise — which is exactly
what happened here for one confusing pass. `.gitattributes` normalises the repo
to LF and marks the binaries, and prettier's `endOfLine: "auto"` accepts either,
so a Windows and a Linux clone agree.

Neither is a feature. Both were sitting in plain output that had been scrolling
past for weeks, which is the same lesson as reading the log.

**And `npm test` was failing about 40% of the time.** `undo.test.mts` exited
3221226505 — `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` from
libuv's `src\win\async.c`. Its ten checks passed on every single run; the crash
came *after*, on process teardown, because Node's fetch keeps a socket alive and
`process.exit()` landed on top of one closing.

Worth naming as a bug rather than an environment quirk. A suite that goes red at
random on a file that passed is worse than one that is red for a reason: the only
sustainable response to an intermittent red is to stop reading them, and after
that a real failure looks identical. The harness closes the connection pool
before exiting now.

Measured, and stated as measured: 8/8 on the file that flaked, and 19 full-suite
runs since the change of which 18 passed. Against a baseline of 2 failures in 5,
that is a large improvement and not a proof. The honest claim is "rare", and the
symptom is documented so the next person who hits it recognises it instead of
bisecting their own commit.

---

## 26. A username and a password, and the device never asks again

### Why the magic link went

§23 chose an emailed link for good reasons: nothing to choose, nothing to forget,
no password column to breach. §24 then built the delivery it needed — three
transports, a From address, STARTTLS versus implicit TLS, a rewrite warning for
Gmail, a per-address throttle, a "check your email" screen.

Every one of those is machinery in service of *delivery*, and delivery was only
ever there because the credential had to travel. The verdict came from using it:
a sign-in ends at a screen saying to go and look somewhere else, and on an
install with no provider that somewhere else is the terminal. The person who has
to be told this is a flatmate.

A password box asks for the credential directly. Delivery stops being part of
sign-in, and the entire subsystem stops being load-bearing — so it is deleted,
not left switched off. §21's rule: a feature that renders correctly over a
mechanism nothing needs is the thing this project keeps removing.

### The shape

- **Username and password.** `user.name` was already `UNIQUE`, so it is the
  login identity — no second column, no second notion of who somebody is.
- **scrypt from `node:crypto`**, per-user salt, versioned `s1$salt$hash`,
  timing-safe compare. No dependency, so §17's clone-and-run holds.
- **The session lasts ten years.** That is the feature, not an oversight. A
  learner opens this every morning for seven months; a sign-in screen in front
  of the one button is friction with nothing behind it. Sign out on `/wer` is
  the escape hatch for a shared laptop, and the trade — whoever holds the device
  is you — is stated in the README rather than discovered.

### Forgetting the password, without an inbox

A reset always needs a second channel to prove identity. With no email there are
two honest options and the app does both: a **recovery code** shown once at
sign-up, and `npm run passwd` for the operator.

The code is `X7K2-9PQR-M4TW-BH3D` — four groups of four from an alphabet with no
O, 0, I, 1 or L, because it gets written on paper and typed back months later.
Case, spaces and dashes are all forgiven for the same reason. It is stored as
sha256 rather than scrypt: it is 79 bits this server generated, so there is no
dictionary to run at it — the reason a *password* needs scrypt is that a person
chose it.

**Using a code spends it** and a fresh one is issued. Otherwise a code glimpsed
once is a permanent key to the account. `npm run passwd` also destroys every
session for that account, because a reset that leaves the old devices signed in
has not locked anybody out.

### What the door refuses

- A wrong password and an unknown username return the **byte-identical** body.
  `tests/auth.test.mts` asserts the two messages match, because differing ones
  turn the sign-in form into a list of who has an account here.
- **Eight failures locks that username for five minutes**, checked before any
  query — a locked name costs a round trip and yields no timing signal. In
  memory, keyed on the username: a disk write per wrong password would be a
  denial-of-service lever, and an IP is trivially changed.

### The bug the test found first

`verifyPassword` decoded the stored hash and compared it against a freshly
derived key of the same length. `Buffer.from("!!", "base64url")` does not throw
on rubbish — it returns an **empty buffer** — and `timingSafeEqual(empty, empty)`
is `true`. A row reading `s1$!!$!!` therefore accepted **every password**.

No real row looks like that, which is exactly why it would have survived: it
needs a corrupt or hand-edited database to trigger, and then it is a total
bypass. The lengths are checked before the compare now, and
`tests/password.test.mts` drives nine malformed stored values against two
different passwords each.

Written before the feature was wired to anything, which is the only reason it was
found on a laptop rather than in a public repo.

### Opening the console, which nobody had done

§21 listed passes by what each could structurally see. A tenth was missing and is
the cheapest of the lot: open the browser console and read it. Three faults were
sitting there, and the app rendered correctly for all three.

**The recap raced the grade it was counting.** One review graded, session
finished, recap says `0 WIEDERHOLUNGEN` — with the attempt row already written,
timestamped a few seconds earlier. Blocks send grades fire-and-forget so the next
card is instant; `/api/session` computes the recap by counting today's attempts.
Nothing ordered the two.

This is §21's own example screen — the one caught reporting zeros because
`requestAnimationFrame` does not run in a background tab — failing again for an
unrelated reason. Worth noting as a pattern: a screen assembled from a count of
rows written asynchronously will keep finding new ways to be early. `outbox.ts`
tracks in-flight sends and exposes `settled()`; `finish()` awaits it. Verified by
the numbers matching the table, not by the error going quiet.

**Two blocks set state on their parent during render.** `FixBlock` and
`GrammarBlock` both called `onDone()` straight from the render path when they had
nothing to show — React's "Cannot update a component while rendering a different
component". Both return early, so a hook cannot be added at that point;
`SkipToNext` in `blocks/shared.tsx` is a component that renders nothing and calls
`onDone` from an effect.

**`<p>` inside `<p>`.** `Empty` wrapped its children in a paragraph; callers pass
prose that is already one. Invalid HTML, a hydration mismatch, and a page that
looks entirely correct.

**The trap in checking it.** The console buffer persists across navigations, so
after all three were fixed it still listed them — reading as "still broken" and
inviting a second round of chasing something already gone. A fresh tab is the
only honest reading. Worth knowing before the next person spends an hour on it.
