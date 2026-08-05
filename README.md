# DeutschMate

**DeutschMate is a German teacher.**

Not a chatbot. Not a flashcard app. Not a grammar reference.

A1.1 → B1.2 in about seven months of self-study, one hour a day. Runs on a
laptop or a small box, and costs the person hosting it nothing: the course is
free, and the four features that need a model run on each learner's own key.

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

`setup` checks your Node version, builds the whole database from the files in
`data/` — 2,400 words, 120 units, 36 grammar points, 38 readings, 1,827 levelled
sentences — and generates the two secrets the app needs into `.env.local`. No
network, no downloads, no API key required.

```bash
npm run dev
npm run invite you@example.com     # prints your sign-in link
```

Follow the link and press Enter. There is no password: sign-in is a single-use
link, and email delivery is deliberately not configured, so the link is printed
in the terminal for you to hand over. `npm run config` shows every setting the
server is actually using.

Add your own Anthropic key later, in **Einstellungen** — see below for exactly
what it buys and what works without it.

### Everyone brings their own key

The course is free and runs on this machine. Four things need a model, and they
run on **each learner's own Anthropic key**, added in **Einstellungen**:

| Needs a key | Without one |
|---|---|
| Gespräch | the unit's scripted dialogue |
| Schreibkorrektur | your text is queued and corrected when a key appears |
| "Erklär mir das" | from the cache, if anyone has asked before |
| Eselsbrücken | unavailable, and says so |

Everything else costs nothing and needs nothing: 2,400 words with audio, 120
units, 36 grammar points, 38 readings, the FSRS engine, cloze mining, practice
exams, minimal pairs, walk mode — and **955 prebuilt explanations**, so a wrong
answer still comes back with a reason. No feature invents an answer.

So this install's bill does not grow with the number of people on it, and
nobody can spend anybody else's money. About **$2.45 a month** for someone
studying daily; each learner sets their own cap, and zero is a valid cap.

**The key is stored encrypted** — AES-256-GCM, keyed by `DEUTSCHMATE_SECRET`,
which `npm run setup` generates. What is in the database is ciphertext plus the
last four characters for the settings page; the key is never returned to a
browser, never logged, and never in an HTTP response. That protects a database
that leaves the machine — a mislaid backup, a copied file — and not somebody who
can already read the server's environment. That is the honest limit.

`ANTHROPIC_API_KEY` still works as a server-wide fallback for accounts with no
key of their own, which keeps a single-person install exactly as it was. Leave
it empty on anything shared.

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

**Every wrong answer gets a reason, and most of them cost nothing.** Four tiers:
the exact sentence pair if anyone has hit it before → **955 prebuilt patterns**
→ the cheap model → the rule-based tag description.

Tier two is the one that matters for the bill. It is keyed on the *difference*
rather than the sentences, so `w:der→den` covers the accusative slip in every
sentence it can happen in, and `v:-e→-st` covers the du ending on every regular
verb in the language. Articles and case, the perfect auxiliary, verb endings,
nicht vs kein, pronouns, prepositions, sixty-odd confusable word pairs — most of
what a beginner actually gets wrong is answered instantly, offline, for free.
`data/error-patterns.json`, and spec §22 for why the key had to change before
any of them could be written.

The fourth tier is why it can never come back empty: with no key, no network or
a spent budget, *"Nominative article where accusative is needed"* is still true.

---

## Configuration, and the four kinds of it

Conflating these is how a setting ends up in the wrong place and stays there.

| Kind | Lives in | Examples | Changes when |
|---|---|---|---|
| **Deployment** | env, read via `src/lib/env.ts` | URL, mail transport, budget, admin switch, DB path | you move machines |
| **Provider catalogue** | `data/models.json` | model ids, prices, cache multipliers | Anthropic changes something |
| **Product constants** | `src/lib/config.ts` | new words per day, review cap, leech threshold | you change the course |
| **Per learner** | the `user` table | their API key (encrypted), their spend cap | any learner, any time |

```bash
npm run config     # every setting's effective value, the price list, and what looks wrong
```

Two of these were not config until recently and should have been.

**Prices were a literal in `pricing.ts`.** The day Anthropic changes a rate,
`/fortschritt` reports the wrong spend — confidently, with no error. Principle 4
says never show a number you cannot point at the row that produced it, and a
price nobody has checked since it was typed is exactly that number. It is
`data/models.json` now, with an *as-of* date the cost page prints, and a model
the catalogue does not know is reported as unpriced rather than folded into a
total that reads as complete. It also fixed a live understatement: the tutor
prompt is cached for an hour (2× on the write) and was being billed at the
five-minute rate (1.25×), which the old comment admitted and kept doing.

**Product constants were in twelve files.** Each was named and commented where
it sat, and nobody could still answer "what does this app decide for you"
without reading all twelve. They are in one module now — **deliberately code,
not settings**. Principle 1 is that the app decides; a "new words per day"
slider would undo the thing that makes it work, and every knob is a combination
somebody has to support.

**Every `process.env` read had its own fallback and failed silently.**
`DEUTSCHMATE_BUDGT=5` is not an error, it is a budget of $5 because the typo'd
name was never read. `env.ts` names each variable once and `npm run config`
prints what the server actually thinks — including that a wrong
`DEUTSCHMATE_URL` sends every sign-in link somewhere nobody can follow.

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

Twenty-four suites, no framework. Sixteen run anywhere; eight need `npm run dev`
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
| `error-key` | 41 mistakes a beginner really makes, each one reaching a specific prebuilt explanation |
| `strings` | no HTML entity survives into a string literal, where JSX will not decode it |
| `undo` | one grade is one attempt row and one step of the curve — never two |
| `tenancy` | you cannot act as another learner, mint an account, or write to shared content |
| `auth` | tokens work once, sessions are stored hashed, deleting an account takes its credentials |
| `apikey` | a stored key is never in the row, never in the response, and never another learner's |
| `shared-cache` | course sentences are cached for everyone, pasted text only for you, and both are deletable |
| `mail` | half-configured mail is caught, the link is in both parts of the message, and nothing in it phones home |

`corpus` and `error-key` are worth a note on how they are written, because both
guard the same kind of failure.

The obvious corpus test — "do two consecutive days differ?" — passed while the
rotation was reaching 6% of the sentences, because consecutive days *did*
differ; it was day 36 that repeated day 0. So it measures coverage over the 210
days the course actually takes.

The obvious error-pattern test — "are there 200 rows?" — would pass on 200 rows
that never match anything. So it drives 41 wrong answers a beginner really
produces and fails unless each one reaches a specific explanation. It caught
four real bugs on its first run, including entries written about infinitives
that could never match the conjugated forms people type.

A feature that runs, looks full, and does nothing is the kind this suite exists
to catch.

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
tests/         24 suites, run with `npm test`
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

**You sign in.** Your email, a link, no password — nothing to choose, forget or
leak. The first address to ask on a fresh install gets an account; after that,
new accounts come from the invite field on `/wer` or from `npm run invite`.

```bash
npm run invite anna@example.de        # new account, or a link for an existing one
npm run invite                        # list the accounts on this install
```

**The link is emailed if you configure a provider, and printed if you don't.**
Printing is the default and stays it: a provider means an account, a verified
domain and a network, and `npm run setup` still works with none of those.

```bash
npm run mail:test                    # what is configured, and whether it can send
npm run mail:test you@example.com    # send one, and say what came back
```

Two transports, both switched on by filling in credentials — there is no second
switch to forget:

| | Set | Notes |
|---|---|---|
| **SMTP** | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Any provider, including a company mailbox. Gmail and Microsoft 365 want an **app password**, not your account password. |
| **Resend** | `RESEND_API_KEY` | One HTTP call, no dependency. The sending domain must be verified there first. |

Both also need `DEUTSCHMATE_MAIL_FROM`, on a domain the provider will accept.

Port and TLS is where SMTP setups actually break: **587 is STARTTLS**, **465 is
TLS from the first byte**, and getting them the wrong way round produces a hang
rather than an error. The port picks the mode on its own; `SMTP_SECURE` is only
there for a provider that disagrees.

Three things the sending path is careful about:

- **A dead provider does not lose the link.** The send failure is logged loudly
  and the link still prints to the terminal, so you can hand it over. Losing it
  would strand a real person mid-sign-in for no benefit.
- **A dead provider does not leak who has an account.** Mail being broken is
  checked *before* the address is looked up, so that 503 is true regardless of
  who asked. A failure *after* the lookup still returns the ordinary success —
  "sending failed" would otherwise mean "this address has an account here".
- **The message does not phone home.** No image, so no tracking pixel; no
  link-wrapping redirect; the plain-text part carries the URL too, because some
  clients render that one and a link that exists only in the HTML is a sign-in
  that works for most people and mysteriously doesn't for one.

`deliver()` in [src/lib/auth.ts](src/lib/auth.ts) is still the single seam —
everything above it is unchanged, and `console` is still one of the options.

Identity used to be a name in a readable cookie, `dm_user=sid`, settable from
the browser console — plus `?user=alex` on eight GET routes and a `"user"` field
in twelve POST bodies, both of which overrode it without a check. On one laptop
that was the design (spec §10). It stops being one the moment a third person can
reach the server.

Now it is a random 32-byte session token in an httpOnly cookie, and **both the
session and the sign-in link are stored only as sha256** — a copy of the
database must not let anybody sign in as anybody. Sessions last 14 days; links
work once and expire in 20 minutes, and asking for a new one kills the old.

`?user=` still works for the test suite, and only for it: it needs
`DEUTSCHMATE_TEST_AUTH`, fails closed, and is what lets the tests drive
throwaway learners through the real isolation mechanism. See `src/lib/trust.ts`.

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

### What the other people here can read

Explanations are cached and **shared on purpose** — that is why the second
person to ask about a sentence pays nothing, and why the app gets cheaper the
more it is used. The line is drawn at whose German it is:

| | shared with everyone here | private to you |
|---|---|---|
| a sentence from the course | ✓ | |
| a mistake you made in an exercise | ✓ | |
| German you pasted into `/text` | | ✓ |
| your writing, your answers, your deck | | ✓ |

The app decides which by checking the sentence against its own content tables.
**There is no request parameter for it** — a page asking to share is not
evidence the text is safe to share, and pasted text is where the letters from
the Ausländerbehörde end up. The rule fails toward private, so the worst case is
a duplicate model call, not a published letter.

**Einstellungen → Zwischenspeicher** shows what you have contributed, as counts,
and deletes it: your own, or also what you gave the shared pool. The 955
prebuilt explanations are never in scope — they shipped with the app and the
offline tier depends on them.

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
- **Video** — Deutsche Welle, *Nicos Weg*, embedded via the standard YouTube
  player. Nothing downloaded, no captions scraped; the video is served by
  YouTube on their terms and the transcripts in `segments_json` are typed by
  whoever marked the video up.
- **Scheduling** — [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), MIT.

Practice tests are built from this app's own content. They are **not** the
official Goethe Modellsatz and predict nothing; the real ones are free PDFs from
the [Goethe-Institut](https://www.goethe.de/de/spr/kup/prf.html).

---

## Known gaps

- **Videos are chosen but not yet segmented.** Twenty Deutsche Welle *Nicos Weg*
  episodes are in `data/videos.json`, verified and seeded; six are linked to the
  unit their title matches. **None has segments, so the video block still never
  appears** — that is correct, not broken: an unsegmented embed is a YouTube
  link, not a lesson, and `session.ts` will not offer one.

  The remaining work is deliberately human. A segment is a timestamp plus the
  line actually spoken, and the only way to know the line is to listen to it —
  generated "transcripts" would be subtitles that disagree with the audio, which
  is worse than no video because a learner would believe them. Typing them by
  hand also keeps the app to embedding rather than scraping captions. Roughly
  ten minutes each, at `/admin/video` with `DEUTSCHMATE_ADMIN=1`, which now
  shows a work queue: unsegmented first, in episode order, with the unit each
  belongs to.

  ```bash
  npm run videos                          # verify every id, then seed
  npm run videos -- --check               # verify only, write nothing
  npm run videos -- --from-playlist <ID>  # append more from a DW playlist
  ```

  Coverage stops at A1 episode 14 of ~76. YouTube's playlist pages redirect to a
  consent banner, and its RSS feeds return only the newest 15 entries per
  playlist — so the rest need either more playlist ids or pasting them in by
  hand.
- **Speech recognition needs Chrome, Edge or Safari.** Firefox has never shipped
  the Web Speech API. Speaking and voice mode degrade to listen-and-repeat there
  and say which browsers work. This is feature-detected, so the day Firefox
  ships it, it turns on with no code change.

### Closed since

- ~~The Progress page is eleven sections in flat order.~~ Now four named bands —
  *Was kannst du · Wie läuft es · Was hakt · Nebenbei* — each showing the
  question it answers. Named after questions rather than after data, so anything
  answering no question a learner actually asks sits at the bottom.
- ~~`/alltag` needs the network.~~ All six now carry a scripted branching
  dialogue, so they run with no key, no budget and no signal. They were the last
  scenarios in the app without one, and the worst six to be missing it: these
  are what you rehearse the night before, often on a phone. The live model
  conversation is still the better path when it is available.

### A note on how these were found

Spec §21 lists a sweep for one failure shape: a feature that renders correctly
over a mechanism that is not connected. It found nine, including a conversation
tracker that could never be true, an offline queue for written texts that stored
nothing, and a sentence rotation reaching 6% of the corpus behind a comment
claiming it covered all of it.

Three passes, each finding what the one before it structurally could not:

| | |
|---|---|
| reading the code | disconnected mechanisms, dead columns, drifted duplicates |
| reading the rendered HTML | a button printing `&apos;` — the source looked like the working case |
| **doing an hour of German** | a recap that reported the session had not happened |

That last one is worth the detail. The recap counters animate up from zero with
`requestAnimationFrame`, browsers do not run rAF in a background tab, and there
was no fallback — so finishing a session and locking your phone left **0 Minuten
· 0 neue Wörter · 0 %** on the screen the code itself calls "the screen that
decides whether you come back tomorrow". The database had it all along.

The same pass caught the conversation tracker still broken one commit after
being fixed: the fix had gone into the live path, which needs an API key, while
the scripted fallback — the only path that runs without one — was untouched.

If you are reading this repo to judge it, read §21 and §22 first.
