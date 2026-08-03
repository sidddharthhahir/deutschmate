# DeutschMate

**DeutschMate is a German teacher.**

Not a chatbot. Not a flashcard app. Not a grammar reference.

A1.1 → B1.2 in six months of self-study, one hour a day. Built for two people,
runs on a laptop, costs nothing but an API key.

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
database from the files in `data/` — 1,225 words, 120 units, 36 grammar points,
38 readings, 1,827 levelled sentences. No network, no downloads.

Then put your key in `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-…
```

And start it:

```bash
npm run dev
```

http://localhost:3000 — press Enter.

### Without an API key

Everything works except three things, and each fails honestly rather than
silently: **Gespräch** falls back to the unit's scripted dialogue, **Schreiben**
queues your text and corrects it once a key appears, and **"Erklär mir das"**
says it is unavailable. No feature invents an answer.

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
   learner already knows. This is what separates a teacher from a chatbot.
4. **Never fake progress.** If you can't point at the database row that produced
   a number, don't show the number.

---

## What it does

Press Enter on the home screen and it runs today's session — reviews, your own
mistakes, new material, listening, speaking, a quiz — then stops.

| | |
|---|---|
| **Sitzung** | The daily hour. Fixed rhythm, content chosen for you. |
| **Wortschatz** | All 1,225 words with native audio. |
| **Üben** | Where *you* choose: scenarios, grammar, tests, pronunciation. |
| **Fortschritt** | Every number is a count of something you did. |

And the parts that aren't a course:

- **Dein Text** — paste any German. It tells you what you already know, what it
  can teach you next, and turns sentences into cards.
- **Nachrichten** — today's news, slowly spoken, from Deutsche Welle.
- **Alltag** — Bürgeramt, WG-Besichtigung, Arzt, Bank, Vertrag kündigen.
- **Unterwegs** — hands-free listening for the walk to uni.
- **Minimalpaare** — pronunciation drills aimed at the sound you actually miss.

---

## Commands

```bash
npm run setup            # build the database from data/
npm run dev              # start (localhost)
npm run dev:lan          # start (reachable from your phone)
npm run backup           # snapshot + JSON export of your progress
npm run restore <file>   # put a backup back
npm run export-deck      # Anki-ready TSV + full JSON
```

Content tools, only needed if you change the source data:

```bash
npm run audio             # fetch pronunciations from Wikimedia Commons
npm run import-words      # rebuild words from data/wordlist-*.txt
npm run import-sentences  # re-pick Tatoeba sentences (downloads 11 MB)
```

---

## How it's put together

```
data/          content, committed — words, units, grammar, readings, sentences
src/lib/       the engine — FSRS scheduling, session builder, error tagging
src/app/       pages and API routes
scripts/       content generation and maintenance
public/audio/  1,222 native recordings from Wikimedia Commons
```

**Content and progress are separate.** Everything in `data/` is shared and
committed; the database holds both, but the tables are split so your progress is
never mixed with the course. That's why `setup` can rebuild content without
touching your cards, and why two people can share the repo and not each other's
decks.

`deutschmate.db` is **gitignored**. It is your learning history and lives on your
machine only. Back it up.

### Two people — partly built

The database is fully ready for it: every progress table is keyed by user, and
the API routes honour `?user=alex`. **The pages do not.** All nine
server-rendered pages currently hardcode `sid`, so a second person on the same
install would see the first person's progress everywhere.

Two people on **separate machines** works perfectly today — each clone has its
own database, which is the setup this was built for. Two people sharing one
install needs a user switcher (a cookie and `activeUser()` in place of the
hardcoded name) that isn't written yet.

---

## Credit and licences

- **Sentences** — [Tatoeba](https://tatoeba.org), CC-BY 2.0 FR. Contributor IDs
  are stored on every row and shown wherever the sentences appear.
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

- **No video has timestamps yet**, so the video block never appears. The editor
  is at `/admin/video` and takes about ten minutes per video.
- **Speech recognition is Chrome-only.** Speaking and voice mode degrade to
  listen-and-repeat elsewhere, and say so.
