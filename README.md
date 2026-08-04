# DeutschMate

**DeutschMate is a German teacher.**

Not a chatbot. Not a flashcard app. Not a grammar reference.

A1.1 → B1.2 in about seven months of self-study, one hour a day. Built for two
people, runs on a laptop, costs nothing but an API key.

Seven, not six: the deck is 2,400 words and a session introduces at most twelve
a day, so the vocabulary alone is 200 days. `/fortschritt` shows your own
projection from your own pace rather than that average.

---

## Get it running

You need **Node 24 or newer** — the database is `node:sqlite`, which ships with
the runtime. Nothing to compile, no native modules, no database server.

```bash
git clone <your-repo-url> deutschmate
cd deutschmate
npm install
npm run setup
```

`setup` checks your Node version, creates `.env.local`, and builds the whole
database from the files in `data/` — 2,400 words, 120 units, 36 grammar points,
38 readings, 1,827 levelled sentences. No network, no downloads.

Then put your key in `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-…
DEUTSCHMATE_BUDGET=5
```

`DEUTSCHMATE_BUDGET` is dollars per learner per rolling 30 days, and it is
**enforced, not displayed** — every paid call checks the month's spend first and
falls back to the offline path once it's gone, exactly as it does with no key at
all. Default 5, so two flatmates share $10. Set it to 0 to run with no AI
spending whatever.

And start it:

```bash
npm run dev
```

http://localhost:3000 — press Enter.

### Without an API key

Everything works except three things, and each fails honestly rather than
silently: **Gespräch** falls back to the unit's scripted dialogue, **Schreiben**
queues your text and corrects it once a key appears, and **"Erklär mir das"**
is served from the cache if anyone has asked before, or says it is unavailable.
Wrong answers are still explained — the rule-based tier needs no key. No feature
invents an answer.

### On your phone

```bash
npm run dev:lan
```

Serves on your LAN or tailnet. Open the address it prints; add to home screen and
it installs as an app. `next.config.ts` already allows private address ranges,
which is what stops hot reload dying silently from another device.

---

## The four principles

1. **One button.** The app decides what you study. Never make the user choose a
   lesson, a skill, or a difficulty.
2. **Offline-first.** A full daily session must be finishable in airplane mode.
   Every block has an offline path; the session runner never dead-ends.
3. **Vocabulary-constrained AI.** Every generated sentence uses only words the
   learner already knows, and the tutor is briefed on what *this* learner keeps
   getting wrong — then told never to mention it. That is what separates a
   teacher from a chatbot.
4. **Never fake progress.** If you can't point at the database row that produced
   a number, don't show the number.

---

## What it does

Press Enter on the home screen and it runs today's session — reviews, your own
mistakes, new material, listening, speaking, a quiz — then stops.

| | |
|---|---|
| **Sitzung** | The daily hour. Fixed rhythm, content chosen for you. |
| **Wortschatz** | All 2,400 words, 2,373 of them with native audio. |
| **Üben** | Where *you* choose: scenarios, grammar, tests, pronunciation. |
| **Fortschritt** | Every number is a count of something you did. |
| **Der Weg** | All 120 units at once, which of them are still sticking, what you can now do, and dated milestones. |

And the parts that aren't a course:

- **Dein Text** — paste any German. It tells you what you already know, what it
  can teach you next, and turns sentences into cards.
- **Nachrichten** — today's news, slowly spoken, from Deutsche Welle.
- **Alltag** — six conversations you will actually have: Bürgeramt,
  WG-Besichtigung, Arzt, Bank, Vertrag kündigen, Prüfungsamt. Each with what
  to bring, what to say, and **what they will say back** — the half that
  decides whether the appointment works.
- **Unterwegs** — hands-free listening for the walk to uni.
- **Minimalpaare** — pronunciation drills aimed at the sound you actually miss.

---

## How a day is chosen

Four to ten blocks, always in the same order, with the content rotating
underneath. The rhythm is fixed so you stop thinking about it; the rotation
stops the rhythm becoming a rut. It is deterministic per calendar day — never
random — because reloading a session you are halfway through must not hand you
a different one.

| Slot | | |
|---|---|---|
| 1 | **Aufwärmen** *or* **Nur Hören** | due cards, capped at 60. Every third day the word is hidden until you answer. Absent if nothing is due — which is every day of your first week. |
| 2 | **Fix** · **Lücken** | your own recent mistakes. Absent when you have none. |
| 2b | **Grammatik-Wdh.** | rules that are due back. On the FSRS curve, so it appears whether or not you got anything wrong. |
| 3 | **Neue Wörter** *or* **Grammatik** | never both in a day — two novel loads halve retention of each. |
| 4 | **Hören** · **Lesen** · **Wiederlesen** · **Video** | rotates. Every other reading day it is an *old* text. |
| 5 | **Sätze bauen** | |
| 6 | **Sprechen** *or* **Schreiben** | speaking two days in three. |
| 7 | **Gespräch** *or* **Nochmal sprechen** | every third one is a scene you did weeks ago. |
| 8 | **Abschluss** | the closing quiz, then the recap. |

A full day is eight or nine blocks and about ninety minutes; a quiet one is
four. Nothing is padded to reach a number.

Three things that follow from this and are easy to miss:

**Old material comes back.** Words and grammar are on a forgetting curve;
scenarios and readings used to be one-and-done. A conversation is the slowest
thing in the course to build and the fastest to lose, so past ones return —
labelled *"schon gemacht · Unit 10 · Fragen stellen"* (a reading says *"schon
gelesen"*) so it reads as revision, not as the app losing its place. Only units
finished over a week ago count: redoing yesterday is the same lesson, not a
second pass.

**Speaking gets two slots of three.** It is the skill self-study destroys and
the only output skill that costs nothing per use — Web Speech runs in the
browser, while writing correction is a model call.

**A short day exists.** `/session?kurz=1` runs slots 1–2 only: the things that
decay if you skip them. New material waits for tomorrow. On a day with nothing
due and no recent mistakes it is empty, and says so rather than inventing
filler.

**A long absence collapses the session.** Three days away *and* more than forty
cards waiting gives you **Wiedereinstieg**: twenty reviews, nothing else. A gap
with a small backlog just gives you a normal day — the point is the backlog,
not the guilt.

`src/lib/rhythm.ts` holds every one of these decisions as a pure function, so
the whole month can be walked in a test — a rotation that quietly stopped
firing would otherwise look exactly like the old behaviour.

---

## The AI, and what it costs

Five call sites, all in `src/lib/ai.ts`, each stating its model and settings in
one table at the top of the file rather than inheriting a default:

| | Model | Thinking | Why |
|---|---|---|---|
| Conversation | Sonnet 5 | off, effort `low` | short, formulaic, already constrained by the whitelist |
| Post-chat review | Sonnet 5 | off, effort `low` | |
| Writing correction | Sonnet 5 | adaptive, `medium` | a handful a week; a missed error is one you keep making |
| Sentence explanation | Haiku 4.5 | — | cached in SQLite, so this converges toward free |
| Mistake explanation | Haiku 4.5 | — | same, keyed by (expected, answer) |

Sonnet 5 **thinks by default** when the parameter is omitted, which is why
every call names its choice: a two-sentence café reply does not need a
reasoning pass, and thinking is billed at output rates.

**Caching.** The vocabulary whitelist is identical every turn and grows to a
few thousand tokens, so it sits behind a cache breakpoint with a **1-hour TTL**
— one write per sitting instead of one every few minutes. Twenty turns of a
5k-token prompt: 30.0¢ uncached, 4.7¢ cached. It does not fire on day one:
Sonnet's minimum cacheable prefix is 1024 tokens and a beginner's whitelist is
tiny, so it starts paying somewhere in the first month. Watch the measured
**"% aus Cache"** on Fortschritt rather than assuming.

**The budget is enforced.** Not a warning label — every paid call checks the
month's spend first and, once it is gone, takes the same offline path a missing
key takes. Nothing dead-ends.

**The tutor knows who it is talking to.** Three error tags and four lapsing
words go into the prompt *after* the cache breakpoint, with instructions to
steer toward them and never to mention them. A model told what you struggle
with will try to help by explaining it, and a tutor that stops to teach
mid-sentence is how beginners stop talking — corrections run afterwards, on
purpose.

**Every wrong answer gets a reason.** Cache → cheap model → the rule-based tag
description. That third tier is why it can never come back empty: with no key,
no network or a spent budget, *"Nominative article where accusative is needed"*
is still true.

---

## Commands

```bash
npm run setup            # build the database from data/
npm run dev              # start (localhost)
npm run dev:lan          # start (reachable from your phone)
npm run backup           # snapshot + JSON export of your progress
npm run restore <file>   # put a backup back
npm run export-deck      # Anki-ready TSV + full JSON
npm test                 # the checks below
```

### Tests

```bash
npm test                 # all of them
npm test text outbox     # only files matching these names
```

Sixteen suites, no framework. Ten run anywhere; six need `npm run dev`
listening and are **skipped with a message** if it isn't — never quietly
passed. They use throwaway user ids in the real database, which is how the app
separates two flatmates, and clean up after themselves.

| | |
|---|---|
| `content` | every word belongs to a unit, every reference resolves, every noun has an article |
| `fresh-clone` | seeds a throwaway database from `data/` alone and checks nothing is missing |
| `cost` | token pricing, the cache saving, and the budget ceiling |
| `rhythm` | walks a month of the session rotation — every skill gets its share |
| `coaching` | the tutor is told your weak spots, and told never to mention them |
| `text` | cloze gaps and exam scoring |
| `outbox` | the offline queue: what is retried, what is dropped, what survives a corrupt store |
| `progression` | walks a new learner through all 120 units and checks every word gets taught |
| `unit-carryover` | an oversized unit comes back tomorrow instead of losing its remainder |
| `mastery` | finishing ≠ retaining, retention never blocks progression, and bad prerequisite data can't strand anyone |
| `scene` | the tutor gets the brief the page is showing — the Alltag six included |
| `recycle` | old scenarios and readings come back, and say where they came from |
| `grammar` | a taught rule returns when due, with a different drill |
| `why` | every wrong answer comes back with a reason, on every path, with or without a key |
| `who` | two flatmates on one browser get separate keys, and a queued answer replays to whoever gave it |
| `corpus` | the sentence rotation covers the corpus over a course, not just over a month |

`corpus` is worth a note on how it is written. The obvious test — "do two
consecutive days differ?" — passed while the rotation was reaching 6% of the
sentences, because consecutive days *did* differ; it was day 36 that repeated
day 0. So the test measures coverage over the 210 days the course actually
takes. A feature that runs, looks full, and quietly serves the same hundred
rows for seven months is the kind this suite exists to catch.

`progression` is the one that matters. Nothing in the app reports "the learner
cannot get past A1.1" — it just keeps offering unit 1, which is exactly what
happened when nothing set `user.level`. The only way to know the course is
finishable is to finish it.

`fresh-clone` is the second one. A working copy accumulates everything every
script has ever written, so content can vanish from the committed files while
the running app still looks complete — which is exactly how `data/examples.json`
came to hold 145 of 2,347 examples without anything appearing to be wrong.

Content tools, only needed if you change the source data:

```bash
npm run audio             # fetch pronunciations from Wikimedia Commons
npm run import-words      # rebuild words from data/wordlist-*.txt
npm run import-sentences  # re-pick Tatoeba sentences (downloads 11 MB)
npm run import-vocab      # top the deck up to 2,400 words (downloads ~1 GB)
npm run attach-examples   # give every word an example sentence
```

`import-vocab` reads the current deck, works out how many words each level is
short of the A1 650 / A2 1300 / B1 2400 targets, and fills the gap from a
subtitle frequency list crossed with the Wiktionary extract. It writes
`data/words-extra.json` and `data/unit-additions.json`, both committed — so you
only need it if you want to change the target. Run it as:

```bash
npm run seed && npm run import-vocab && npm run seed && npm run attach-examples && npm run seed
```

The seed before it matters: the importer measures the deficit against the
database, so a stale deck makes it ask for the wrong number.

---

## How it's put together

```
data/          content, committed — words, units, grammar, readings, sentences
src/lib/       the engine — scheduling, session builder, error tagging, AI
src/app/       22 pages and 17 API routes
src/components/blocks/   the 14 block types a session is made of
scripts/       content generation and maintenance
tests/         14 suites, run with `npm test`
public/audio/  2,381 native recordings from Wikimedia Commons (37 MB)
```

The engine, in the order a session touches it:

| | |
|---|---|
| `srs.ts` · `grammar-srs.ts` | FSRS scheduling for words and for rules |
| `session.ts` | builds the day; `rhythm.ts` decides its shape |
| `errors.ts` | tags every wrong answer — the entire personalisation engine |
| `cloze.ts` · `cloze-text.ts` | mines gap cards from your own mistakes |
| `why.ts` | the three-tier answer to "warum?" |
| `ai.ts` · `coaching.ts` | the five model calls, and what the tutor knows about you |
| `scene.ts` · `survival.ts` | which brief the tutor is given — a course unit's, or an Alltag one |
| `cost.ts` · `pricing.ts` | what it cost, and the ceiling that stops it |
| `mastery.ts` | finished vs actually retained — two states, only one of them a gate |
| `journey.ts` | the roadmap and milestones behind Der Weg |
| `outbox.ts` | the offline queue — answers given on a train |

**Four files are pure on purpose** — `pricing.ts`, `cloze-text.ts`, `rhythm.ts`
and `coaching.ts` have no database import, so they can be tested directly by
Node. Each was split out of a bigger module for the same reason: the thing
inside was silently wrong-able. A mispriced token, an off-by-one gap, a
rotation that never fires and a prompt that stops steering all look like
nothing at all from the outside.

**Content and progress are separate.** Everything in `data/` is shared and
committed; the database holds both, but the tables are split so your progress is
never mixed with the course. That's why `setup` can rebuild content without
touching your cards, and why two people can share the repo and not each other's
decks.

`deutschmate.db` is **gitignored**. It is your learning history and lives on your
machine only. Back it up.

### Two people, one install

Go to **`/wer`** and type a name. That name is the identity — there is no
password, because this runs on your laptop and the thing being protected is a
flashcard deck (spec §10). The choice is a cookie, so each browser or phone
stays whoever it was.

Every progress table is keyed by user and every page reads the same
`activeUser()`, so the two halves cannot disagree: your streak, your due cards,
your budget, your milestones. Content is shared — one copy of 2,400 words, one
copy of the audio. Two people on separate machines works too; each clone just
has its own database.

The **browser's** half of that split is `src/lib/who.ts`, and it is newer than
the rest. The saved session, the cached plan, the tour flag and the queue of
answers given offline all lived under one global localStorage key, so switching
learner on a shared laptop handed the next person the previous one's state —
including unsent grades, which then replayed into the wrong deck. Everything
client-side is keyed by learner now, and a replay carries the name of whoever
answered rather than trusting the cookie at the time it lands.

A link can target someone explicitly with `?user=alex`, which is how the tests
drive a throwaway learner without touching yours.

---

## Credit and licences

- **Sentences** — [Tatoeba](https://tatoeba.org), CC-BY 2.0 FR. Contributor IDs
  are stored on every row and shown wherever the sentences appear.
- **Vocabulary** — the hand-written half is original. The 1,175 words in
  `data/words-extra.json` come from English
  [Wiktionary](https://en.wiktionary.org) via the
  [kaikki.org](https://kaikki.org/dictionary/German/) extract, **CC BY-SA 4.0**;
  that file, and any deck exported from it, carry the same licence. Word choice
  and ordering come from
  [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords),
  CC BY-SA 4.0, built from OpenSubtitles.
- **Audio** — [Wikimedia Commons](https://commons.wikimedia.org), free licences;
  see `public/audio/ATTRIBUTION.md`.
- **News** — Deutsche Welle, streamed from their public feed. Nothing copied or
  stored.
- **Scheduling** — [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), MIT.

Practice tests are built from this app's own content. They are **not** the
official Goethe Modellsatz and predict nothing; the real ones are free PDFs from
the [Goethe-Institut](https://www.goethe.de/de/spr/kup/prf.html).

---

## Known gaps

- **No video has been imported at all** — the `video` table is empty and no unit
  carries a `video_id`, so the video block never appears and the input slot
  alternates between listening and reading. The editor is at `/admin/video` and
  takes about ten minutes per video.
- **The Progress page is eleven sections in flat order.** Every number on it is
  real, but nothing says which to read first. `/weg` took the long-arc half
  away; the remainder still needs a hierarchy.
- **Speech recognition is Chrome-only.** Speaking and voice mode degrade to
  listen-and-repeat elsewhere, and say so.
- **`error_pattern` has no prebuilt rows.** Spec §12 planned about 200 common
  mistakes written in advance; none were. The tier exists and works — it just
  starts empty and fills from real answers, so the first person to make a given
  mistake pays for the explanation and the second gets it free.
- **`/alltag` needs the network.** Those six scenarios are conversations by
  design and carry no scripted fallback, so offline they say so and offer the
  phrase list instead of a dialogue. Unit scenarios do have a script.

### A note on how these were found

Spec §21 lists a sweep for one specific failure shape: a feature that renders
correctly over a mechanism that is not connected. It found nine of them,
including a conversation tracker that could never be true, an offline queue for
written texts that stored nothing, and a sentence rotation reaching 6% of the
corpus behind a comment claiming it covered all of it. None of them errored,
none broke a test, and every one of them looked right on screen. If you are
reading this repo to judge it, read §21 first.
