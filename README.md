# DeutschMate

**Learn German the way you'll actually use it in Germany.**

A teacher, not a chatbot, a flashcard app or a grammar reference. It decides
what you do today, and what it teaches is aimed at the conversations you cannot
avoid — the Bürgeramt, the WG viewing, the doctor, cancelling a contract.

A1.1 → B1.2 in about seven months of self-study, one hour a day. Runs on a
laptop or a small box, and costs the person hosting it nothing: the course is
free, and the four features that need a model run on each learner's own key.

Seven, not six: the deck is 2,760 words and a session introduces at most twelve
a day, so the vocabulary alone is 217 days. `/fortschritt` shows your own
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
`data/` — 2,760 words, 120 units, 49 grammar points, 38 readings, 1,827 levelled
sentences, 955 prebuilt explanations and 231 Deutsche Welle video episodes — and
generates the two secrets the app needs into `.env.local`. No network, no
downloads, no API key required.

```bash
npm run dev
```

Open it, pick **Konto erstellen**, choose a username and a password. That is the
whole of it — no email, no confirmation, nothing to wait for. You will be shown a
**recovery code once**; write it down, because with no address to send a reset to
it is the only way back in on your own.

Then press Enter. **That device stays signed in** — the session lasts ten years,
so a language app you open every morning never asks again. Sign out on `/wer`
when you want to hand the laptop to somebody else.

`npm run config` shows every setting the server is actually using, and says when
one of them is wrong in a way that would only show up later.

Add your own Anthropic key later, in **Einstellungen** — see below for exactly
what it buys and what works without it.

### Everyone brings their own key

The course is free and runs on this machine. Four things need a model, and they
run on **each learner's own Anthropic key**, added in **Einstellungen**:

| Needs a key      | Without one                                          |
| ---------------- | ---------------------------------------------------- |
| Gespräch         | the unit's scripted dialogue                         |
| Schreibkorrektur | your text is queued and corrected when a key appears |
| "Erklär mir das" | from the cache, if anyone has asked before           |
| Eselsbrücken     | unavailable, and says so                             |

Everything else costs nothing and needs nothing: 2,760 words, 120
units, 49 grammar points, 38 readings, the FSRS engine, cloze mining, practice
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

**It says different words on a phone.** Every control in the session has always
been a real button, but each was labelled with its shortcut and the tour opened
with _"Press Enter. That is the whole daily decision"_ — the one sentence
defining the product, naming a key that is not there. On a coarse pointer the
tour says _"Tap the one button"_, the reviewing page swaps its keyboard legend
for **Aufdecken · Nochmal · Schwer · Gut · Einfach · Zurücknehmen**, and the
`Esc`, `Enter` and `Leertaste` chips disappear. Inline hints switch in CSS
(`.kbd-hint` / `.touch-hint` in `globals.css`) so there is no frame where a
phone shows the keyboard version; only the two places that need genuinely
different copy use `useCoarsePointer()`. `tests/blocks.test.mts` fails if any
doorway card names a key in its prose.

---

## The principles

Design constraints, not vibes. Every one of them has killed a feature that
would otherwise have shipped.

1. **One button.** The app decides what you study. Never make the user choose a
   lesson, a skill, or a difficulty.
2. **Offline-first.** A full daily session must be finishable in airplane mode.
   Every block has an offline path; the session runner never dead-ends.
3. **Vocabulary-constrained AI.** Every generated sentence uses only words the
   learner already knows, and the tutor is briefed on what _this_ learner keeps
   getting wrong — then told never to mention it. That is what separates a
   teacher from a chatbot.
4. **Never fake progress.** If you can't point at the database row that produced
   a number, don't show the number. A number that was true once counts as
   faked: the streak read the last stored `streak_day` whatever its date, so
   somebody who stopped six days ago was still greeted with "Tag 12".
5. **Life in Germany first.** Teach German through situations people actually
   face. Between two features that both teach equally well, the one that gets
   somebody through an appointment wins.
6. **Reality beats speculation.** An idea earns a place on the roadmap by
   appearing in [FRICTION.md](FRICTION.md) — written down while it was actually
   annoying somebody — not by sounding good in a planning session.

Five and six are newer than the rest, and five is still more direction than
description: today this is a 120-unit German course with a twelve-scenario
living-in-Germany corner. It was six. Principle 5 says which half grows next.

Principle 4 does most of the work. It is why the recap counts rows instead of
animating, why the streak drops to zero the day after you skip one, why
`config.ts` has a test asserting every constant is actually read, and why the
mascot idea below is not built: a friendly line saying _"today you'll learn
shopping words"_ over a session teaching _ich bin, du bist_ is a lie with a
nice voice.

It cuts the other way too. "An unsegmented video is a file, not a lesson" was
principle 4 reasoning, and it hid 231 real Deutsche Welle episodes behind a
condition none of them met — a purity rule that deleted the feature instead of
keeping it honest.

---

## What it does

Press Enter on the home screen and it runs today's session — reviews, your own
mistakes, new material, listening, speaking, a quiz — then stops.

|                 |                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------- |
| **Sitzung**     | The daily hour. Fixed rhythm, content chosen for you.                                               |
| **Wortschatz**  | All 2,760 words, 2,132 of them with native audio.                                                   |
| **Üben**        | Where _you_ choose: scenarios, grammar, tests, pronunciation.                                       |
| **Fortschritt** | Every number is a count of something you did.                                                       |
| **Der Weg**     | All 120 units at once, which of them are still sticking, what you can now do, and dated milestones. |

And the parts that aren't a course:

- **Dein Text** — paste any German. It tells you what you already know, what it
  can teach you next, and turns sentences into cards.
- **Nachrichten** — today's news, slowly spoken, from Deutsche Welle.
- **Alltag** — twelve conversations you will actually have, A1.2 to B1.2:
  Bürgeramt, WG-Besichtigung, Arzt, Apotheke, Krankenkasse, Konto eröffnen,
  Paket abholen, Ausländerbehörde, Handwerker anrufen, Nebenkostenabrechnung,
  Vertrag kündigen, Prüfungsamt. Each with what to bring, what to say, and
  **what they will say back** — the half that decides whether the appointment
  works. All twelve run offline from a scripted branching dialogue.
- **Unterwegs** — hands-free listening for the walk to uni.
- **Minimalpaare** — pronunciation drills aimed at the sound you actually miss.

---

## How a day is chosen

Four to ten blocks, always in the same order, with the content rotating
underneath. The rhythm is fixed so you stop thinking about it; the rotation
stops the rhythm becoming a rut. It is deterministic per calendar day — never
random — because reloading a session you are halfway through must not hand you
a different one.

| Slot |                                                     |                                                                                                                                                                                                   |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Aufwärmen** _or_ **Aufwärmen (Hören)**            | due cards, capped at 60. Every third day the word is played and hidden until you answer. Absent if nothing is due — which is every day of your first week.                                        |
| 2    | **Fix** · **Lücken**                                | your own recent mistakes. Absent when you have none.                                                                                                                                              |
| 2b   | **Grammatik-Wdh.**                                  | rules that are due back. On the FSRS curve, so it appears whether or not you got anything wrong.                                                                                                  |
| 3    | **Neue Wörter** _or_ **Grammatik**                  | never both in a day — two novel loads halve retention of each.                                                                                                                                    |
| 4    | **Hören** · **Lesen** · **Wiederlesen** · **Video** | rotates. Video one day in three where the unit has one — 33 of the 40 A1 units are matched to a _Nicos Weg_ episode. Reading borrows an old text when this unit has none of its own, and says so. |
| 5    | **Sätze bauen**                                     |                                                                                                                                                                                                   |
| 6    | **Sprechen** _or_ **Schreiben**                     | speaking two days in three.                                                                                                                                                                       |
| 7    | **Gespräch** _or_ **Nochmal sprechen**              | every third one is a scene you did weeks ago. Absent for the whole of A1, which has no scenarios written yet.                                                                                     |
| 8    | **Abschluss**                                       | the closing quiz, then the recap.                                                                                                                                                                 |

A full day is eight or nine blocks and about ninety minutes; a quiet one is
four. Nothing is padded to reach a number.

**A skipped day is said out loud.** Miss a day and the due cards roll into the
next session, which is why today can be half an hour longer than yesterday. The
home screen now says which it is — _„2 Tage ausgelassen“_ — instead of leaving
you to compare two numbers. The streak goes to zero at the same moment: it
counts only while the last session was today or yesterday. Three days away with
a real backlog is a different thing again, and becomes **Wiedereinstieg**.

**Each block says what it is.** The first time you ever meet a block, it opens
with a card naming it, saying what you are about to do and which keys matter,
and then never appears again. A one-line version stays in the header for good.
The tour on `/willkommen` explains the whole app once, before the first
session — which is the single moment none of it is needed yet. Coming back to
the tour on purpose brings the per-block cards back with it.

Three things that follow from this and are easy to miss:

**Old material comes back.** Words and grammar are on a forgetting curve;
scenarios and readings used to be one-and-done. A conversation is the slowest
thing in the course to build and the fastest to lose, so past ones return —
labelled _"schon gemacht · Unit 10 · Fragen stellen"_ (a reading says _"schon
gelesen"_) so it reads as revision, not as the app losing its place. Only units
finished over a week ago count: redoing yesterday is the same lesson, not a
second pass.

**Speaking gets two slots of three.** It is the skill self-study destroys and
the only output skill that costs nothing per use — Web Speech runs in the
browser, while writing correction is a model call.

**A short day exists.** `/session?kurz=1` runs slots 1–2 only: the things that
decay if you skip them. New material waits for tomorrow. On a day with nothing
due and no recent mistakes it is empty, and says so rather than inventing
filler.

**A long absence collapses the session.** Three days away _and_ more than forty
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

|                      | Model     | Thinking           | Why                                                     |
| -------------------- | --------- | ------------------ | ------------------------------------------------------- |
| Conversation         | Sonnet 5  | off, effort `low`  | short, formulaic, already constrained by the whitelist  |
| Post-chat review     | Sonnet 5  | off, effort `low`  |                                                         |
| Writing correction   | Sonnet 5  | adaptive, `medium` | a handful a week; a missed error is one you keep making |
| Sentence explanation | Haiku 4.5 | —                  | cached in SQLite, so this converges toward free         |
| Mistake explanation  | Haiku 4.5 | —                  | same, keyed by (expected, answer)                       |

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
words go into the prompt _after_ the cache breakpoint, with instructions to
steer toward them and never to mention them. A model told what you struggle
with will try to help by explaining it, and a tutor that stops to teach
mid-sentence is how beginners stop talking — corrections run afterwards, on
purpose.

**Every wrong answer gets a reason, and most of them cost nothing.** Four tiers:
the exact sentence pair if anyone has hit it before → **955 prebuilt patterns**
→ the cheap model → the rule-based tag description.

Tier two is the one that matters for the bill. It is keyed on the _difference_
rather than the sentences, so `w:der→den` covers the accusative slip in every
sentence it can happen in, and `v:-e→-st` covers the du ending on every regular
verb in the language. Articles and case, the perfect auxiliary, verb endings,
nicht vs kein, pronouns, prepositions, sixty-odd confusable word pairs — most of
what a beginner actually gets wrong is answered instantly, offline, for free.
`data/error-patterns.json`, and spec §22 for why the key had to change before
any of them could be written.

The fourth tier is why it can never come back empty: with no key, no network or
a spent budget, _"Nominative article where accusative is needed"_ is still true.

---

## Configuration, and the four kinds of it

Conflating these is how a setting ends up in the wrong place and stays there.

| Kind                   | Lives in                       | Examples                                       | Changes when                |
| ---------------------- | ------------------------------ | ---------------------------------------------- | --------------------------- |
| **Deployment**         | env, read via `src/lib/env.ts` | URL, budget, admin switch, DB path             | you move machines           |
| **Provider catalogue** | `data/models.json`             | model ids, prices, cache multipliers           | Anthropic changes something |
| **Product constants**  | `src/lib/config.ts`            | new words per day, review cap, leech threshold | you change the course       |
| **Per learner**        | the `user` table               | their API key (encrypted), their spend cap     | any learner, any time       |

```bash
npm run config     # every setting's effective value, the price list, and what looks wrong
```

Two of these were not config until recently and should have been.

**Prices were a literal in `pricing.ts`.** The day Anthropic changes a rate,
`/fortschritt` reports the wrong spend — confidently, with no error. Principle 4
says never show a number you cannot point at the row that produced it, and a
price nobody has checked since it was typed is exactly that number. It is
`data/models.json` now, with an _as-of_ date the cost page prints, and a model
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
prints what the server actually thinks, and flags the settings that would only
go wrong later.

**And then five of those constants controlled nothing.** `GAP_DAYS`,
`GAP_BACKLOG`, `GAP_CARDS`, `PACE_CUT_ACCURACY` and `CLOZE_PER_SESSION` sat in
`config.ts` documenting decisions still hardcoded in `session.ts` — editing them
changed nothing, nothing errored, and the constant looked authoritative. Moving
a number into one place only helps if the call site was rewired too.
`tests/config.test.mts` asserts the connection itself now: every exported
constant must be imported by something.

`env.ts` had also grown a second copy of three rules that already lived
elsewhere — `budgetCeiling` beside `pricing.ceiling()`, `adminEnabled` beside
`trust.ts`, `serverApiKey` beside `apikey.ts` — which is the same failure this
file was created to end, one layer up and harder to see because both copies look
canonical. One implementation each; `env.ts` re-exports.

---

## The comments, and what was under them

This codebase used to be **19% comment** — 5,140 lines against 21,807 of code
across `src/`, `scripts/` and `tests/`, with 478 blocks of four lines or more,
several of them essays. It is **6% now**: 1,810 lines, 190 blocks. Every block is
one or two lines — its first sentence, plus the one sentence in the block that
carried a warning.

That was done with a script, because 174 files is not a job for judgement
applied 478 times, and then read back over the files where the judgement
mattered. Four notes went back in by hand afterwards, because each documents a
bug already fixed once and deleting it invites the bug back:

|                   |                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared-cache.ts` | `instr`, not `LIKE` — a `%` or `_` in a sentence is a wildcard and would match content it does not appear in, which publishes a private letter |
| `shared-cache.ts` | the 12-character, 3-word floor — _"der"_ occurs in every text the app ships                                                                    |
| `error-key.ts`    | a pattern explanation must be true **without seeing the sentence** — _"'Mann' is masculine"_ is a lie the moment the same key fires on a Frau  |
| `config.ts`       | `PACE_CUT_ACCURACY` is a fraction and the call site compares a percentage; simplifying the `×100` throttles every learner permanently          |

One thing the script had to be taught. Each test file's header carries a
`needs:` line, and [tests/run.mts](tests/run.mts) _parses it_ to decide whether
to start a dev server. Stripping it as prose would have run eight suites against
nothing and reported green — a comment that is load-bearing to a machine, not
just to a reader, which is the category worth checking for before any sweep like
this.

The same pass deleted what was genuinely unused: `unitMastery`, `unitStatus`,
`tags.en`, and the compatibility re-export barrels in `cloze`, `cost`, `errors`,
`exam`, `accounts` and `user` that nothing had imported in months. `db.ts` lost
three `eslint-disable` lines too — `as never[]` says what `as any[]` said,
without the escape hatch.

And one constant was decorative in the way §12's five were. `TUTOR_CACHE_TTL`'s
comment read _"the TTL the tutor prompt is cached with, named once"_, and the
call site four lines below it hardcoded `"1h"`. Named twice is named zero times.

---

## Commands

```bash
npm run setup            # build the database from data/
npm run dev              # start (localhost)
npm run dev:lan          # start (reachable from your phone)
npm run config           # every effective setting, and what looks wrong
npm run passwd <name>    # reset a password; no argument lists the accounts
npm run videos           # verify the video catalogue and seed it
npm run export-content   # segments + mnemonics out of the db, into data/
npm run backup           # snapshot + JSON export of your progress
npm run restore <file>   # put a backup back
npm run export-deck      # Anki-ready TSV + full JSON
npm test                 # the checks below
npm run lint             # eslint
npx tsc --noEmit         # typecheck
npx knip                 # unused files, exports and dependencies
```

`knip` is not a dependency — [knip.json](knip.json) tells it that
`src/app/**/{page,layout,route}`, `scripts/` and `tests/` are entry points, which
is the difference between a report of 56 findings that are all noise and one that
is empty when the code is clean.

Two small things that stop the checks lying to you on Windows.
[.gitattributes](.gitattributes) normalises the repo to LF, because otherwise
every `git add` prints a wall of _"LF will be replaced by CRLF"_ and
`prettier --check` fails on all 130 files over line endings alone — real failures
buried in noise. [.prettierrc.json](.prettierrc.json) sets `endOfLine: "auto"`
so a Windows clone and a Linux one agree. The tree was also only partly
formatted before this — no config existed, so it had been prettier'd wherever
somebody's editor did it and nowhere else.

### Tests

```bash
npm test                 # all of them
npm test text outbox     # only files matching these names
```

Twenty-five suites, no framework. Seventeen run anywhere; eight need `npm run dev`
listening and are **skipped with a message** if it isn't — never quietly
passed. They use throwaway user ids in the real database, which is how the app
separates two flatmates, and clean up after themselves.

**The dev server will die if you leave it running under the suite all day.** It
OOM'd here at a 15.6 GB heap after 5.7 hours and 89,000 requests — `progression`
alone walks 120 units, so twenty-odd full runs is seventy thousand POSTs. That is
Next's dev-mode accumulation, not this app. Restart `npm run dev` and carry on.

Measured, because "it's just dev mode" is exactly the kind of thing that turns out
to be wrong: the production server was capped at a 192 MB old space and given
15,000 attempt POSTs. RSS settled at **224 MB and stayed there** — 224, 226, 226,
227, 228 across five rounds of 3,000 — with zero failures and identical
throughput each round. Uncapped it drifts to 322 MB over the same load, which is
V8 declining to collect while it has 4 GB of headroom, not a leak. Give it a
reason and it collects.

The suite used to fail about **two runs in five**, always on `undo.test.mts`,
always with exit 3221226505 — and its ten checks passed every time. The crash was
libuv's `UV_HANDLE_CLOSING` assertion on Windows: Node's fetch keeps a socket
alive and `process.exit()` was landing on one mid-close. The harness closes the
connection pool first now.

**Reduced, not proven gone.** 19 full runs since: one failure early on, then 18
clean. That is a different order of magnitude from 2-in-5 and it is not zero, so
if you see exit 3221226505 on a file whose checks all printed PASS, that is this
and not your change. Worth the paragraph because an intermittent red on a file
that passed is worse than a real failure — the only sustainable response is to
stop reading reds, and after that a genuine one looks the same.

|                  |                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`        | every word belongs to a unit, every reference resolves, every noun has an article                                                                 |
| `fresh-clone`    | seeds a throwaway database from `data/` alone and checks nothing is missing                                                                       |
| `cost`           | token pricing, the cache saving, and the budget ceiling                                                                                           |
| `rhythm`         | walks a month of the session rotation — every skill gets its share                                                                                |
| `coaching`       | the tutor is told your weak spots, and told never to mention them                                                                                 |
| `text`           | cloze gaps and exam scoring                                                                                                                       |
| `outbox`         | the offline queue: what is retried, what is dropped, what survives a corrupt store                                                                |
| `progression`    | walks a new learner through all 120 units and checks every word gets taught                                                                       |
| `unit-carryover` | an oversized unit comes back tomorrow instead of losing its remainder                                                                             |
| `mastery`        | finishing ≠ retaining, retention never blocks progression, and bad prerequisite data can't strand anyone                                          |
| `scene`          | the tutor gets the brief the page is showing — all twelve Alltag scenarios included, each with enough to say, enough to hear, and enough to bring |
| `recycle`        | old scenarios and readings come back, and say where they came from                                                                                |
| `grammar`        | a taught rule returns when due, with a different drill                                                                                            |
| `why`            | every wrong answer comes back with a reason, on every path, with or without a key                                                                 |
| `who`            | two flatmates on one browser get separate keys, the cookie read is the cookie sign-in writes, and a queued answer replays to whoever gave it      |
| `corpus`         | the sentence rotation covers the corpus over a course, not just over a month                                                                      |
| `error-key`      | 41 mistakes a beginner really makes, each one reaching a specific prebuilt explanation                                                            |
| `strings`        | no HTML entity survives into a string literal, where JSX will not decode it                                                                       |
| `undo`           | one grade is one attempt row and one step of the curve — never two                                                                                |
| `tenancy`        | you cannot act as another learner, mint an account, or write to shared content                                                                    |
| `auth`           | sessions are stored hashed and last ten years, a wrong password and an unknown username answer identically, and a reset signs every device out    |
| `password`       | scrypt round-trips, a corrupt stored hash is a no rather than a yes, and a recovery code survives being copied off paper                          |
| `apikey`         | a stored key is never in the row, never in the response, and never another learner's                                                              |
| `shared-cache`   | course sentences are cached for everyone, pasted text only for you, and both are deletable                                                        |
| `config`         | every constant in `config.ts` is actually read by something — five were not                                                                       |

`corpus` and `error-key` are worth a note on how they are written, because both
guard the same kind of failure.

The obvious corpus test — "do two consecutive days differ?" — passed while the
rotation was reaching 6% of the sentences, because consecutive days _did_
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
npm run import-vocab      # top the deck up to the B1 target (downloads ~1 GB)
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
src/app/       24 pages and 20 API routes
src/proxy.ts   the signed-out redirect, in the edge runtime
src/components/blocks/   the 14 block types a session is made of
scripts/       content generation and maintenance
tests/         25 suites, run with `npm test`
public/audio/  2,381 native recordings from Wikimedia Commons (37 MB)
```

`src/proxy.ts` is `middleware.ts` renamed: Next 16 deprecated that convention
and warned on every boot. It runs in the **edge runtime**, so it imports from
`who.ts` — which imports nothing — rather than from `auth.ts`, which reaches
`node:sqlite` and does not exist there. All it asks is whether a session cookie
is present; who that cookie belongs to is a database question and is answered
per page.

**Everything a clone needs is committed** — including the audio, which is why
the repo is not small. `npm run setup` rebuilds the database from `data/` with
no network. Three things are deliberately _not_ in the repo:

|                     | Why                                                                                                                                                                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deutschmate.db`    | progress is personal, and it is rebuildable from `data/` anyway. `npm run backup` is how you keep it.                                                                                                                                                                                    |
| `.env.local`        | secrets. `.env.example` ships instead, and `npm run setup` fills in the generated ones.                                                                                                                                                                                                  |
| cached explanations | `error_pattern` rows generated at runtime are keyed on the learner's real wrong answer, and `explanation` holds German somebody pasted into `/text`. Committing either would publish it, and would make Einstellungen's "withdraw my contributions" a lie — git history does not forget. |

Everything else that gets made at runtime — video segments, mnemonics — has a
way back into `data/` via `npm run export-content`.

The engine, in the order a session touches it:

|                              |                                                                     |
| ---------------------------- | ------------------------------------------------------------------- |
| `srs.ts` · `grammar-srs.ts`  | FSRS scheduling for words and for rules                             |
| `session.ts`                 | builds the day; `rhythm.ts` decides its shape                       |
| `errors.ts`                  | tags every wrong answer — the entire personalisation engine         |
| `cloze.ts` · `cloze-text.ts` | mines gap cards from your own mistakes                              |
| `why.ts`                     | the three-tier answer to "warum?"                                   |
| `ai.ts` · `coaching.ts`      | the five model calls, and what the tutor knows about you            |
| `scene.ts` · `survival.ts`   | which brief the tutor is given — a course unit's, or an Alltag one  |
| `cost.ts` · `pricing.ts`     | what it cost, and the ceiling that stops it                         |
| `mastery.ts`                 | finished vs actually retained — two states, only one of them a gate |
| `journey.ts`                 | the roadmap and milestones behind Der Weg                           |
| `outbox.ts`                  | the offline queue — answers given on a train                        |

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

**A username and a password.** Everyone picks their own on the sign-in screen —
**Konto erstellen**, and they are in. No address, no confirmation, no inbox, and
nothing for you to configure: this install sends no mail at all.

**The device then stays signed in.** The session lasts ten years, because a
learner opens this every morning for seven months and a sign-in screen between
them and the one button is friction with nothing behind it. **Abmelden** on
`/wer` is there for a shared laptop; you simply never press it.

That is worth saying plainly rather than burying: whoever holds the laptop is
you. For a German course with no payment details that is the right trade, and it
is the trade this app is making on purpose.

**Forgetting the password.** Creating an account shows a **recovery code** once —
`X7K2-9PQR-M4TW-BH3D`. It resets the password, and using it spends it: a code
seen over somebody's shoulder is not a permanent key. Case, spaces and the dashes
are all forgiven, since it gets copied off paper. The alphabet has no O, 0, I, 1
or L for the same reason.

When somebody loses the code as well, that is what you are for:

```bash
npm run passwd                  # the accounts on this install
npm run passwd mira             # set a password, printed once
```

It also signs out every device that account was using — a reset that leaves the
old sessions alive has not locked anybody out.

Three things the door does:

- **A wrong password and an unknown username give the byte-identical answer.**
  Otherwise anyone can list who has an account here by watching which usernames
  answer differently. `tests/auth.test.mts` asserts the two messages match.
- **Eight wrong tries locks that username for five minutes.** Checked before any
  database work, so a locked name costs an attacker a round trip and teaches
  them nothing. Keyed on the username, because that is what is under attack.
- **The password is never stored.** scrypt with a per-user salt, from
  `node:crypto` — no new dependency, so the clone-and-run promise holds. The
  recovery code is a sha256, which is enough for 79 bits this server generated
  itself; the reason a password needs scrypt is that a person chose it.

**The session cookie honours `x-forwarded-proto`.** It used to decide `Secure`
from the request URL, which reads `http:` behind nginx, Caddy or any platform
router terminating TLS — so on a real https deployment the cookie would go out
unprotected and nothing would look wrong.

Identity used to be a name in a readable cookie, `dm_user=sid`, settable from
the browser console — plus `?user=alex` on eight GET routes and a `"user"` field
in twelve POST bodies, both of which overrode it without a check. On one laptop
that was the design (spec §10). It stops being one the moment a third person can
reach the server.

Now it is a random 32-byte session token in an httpOnly cookie, **stored only as
sha256** — a copy of the database must not let anybody sign in as anybody.

`?user=` still works for the test suite, and only for it: it needs
`DEUTSCHMATE_TEST_AUTH`, fails closed, and is what lets the tests drive
throwaway learners through the real isolation mechanism. See `src/lib/trust.ts`.

Every progress table is keyed by user and every page reads the same
`activeUser()`, so the two halves cannot disagree: your streak, your due cards,
your budget, your milestones. Content is shared — one copy of the deck, one
copy of the audio. Two people on separate machines works too; each clone just
has its own database.

The **browser's** half of that split is `src/lib/who.ts`, and it is newer than
the rest. The saved session, the cached plan, the tour flag and the queue of
answers given offline all lived under one global localStorage key, so switching
learner on a shared laptop handed the next person the previous one's state —
including unsent grades, which then replayed into the wrong deck. Everything
client-side is keyed by learner now, and a replay carries the name of whoever
answered rather than trusting the cookie at the time it lands.

**That was true of the scoping and false of the lookup for one release.**
`userFromCookie()` read `dm_user`, the pre-sign-in name cookie, which sign-in
stopped writing the day it moved to `dm_uid`. So the scoping worked perfectly
and every learner scoped to the same fallback name — one shared plan, one shared
resume offer, one shared tour flag, one shared queue. Nothing looked wrong,
because on the install where it was written the signed-in id _is_ the fallback.
It reads `dm_uid` first now and still accepts `dm_user` alone, so a tab left open
across the upgrade keeps its buckets. Four assertions in `tests/who.test.mts`
pin the cookie sign-in actually sets, which is the part that had no test.

A link can target someone explicitly with `?user=alex`, which is how the tests
drive a throwaway learner without touching yours.

### What the other people here can read

Explanations are cached and **shared on purpose** — that is why the second
person to ask about a sentence pays nothing, and why the app gets cheaper the
more it is used. The line is drawn at whose German it is:

|                                       | shared with everyone here | private to you |
| ------------------------------------- | ------------------------- | -------------- |
| a sentence from the course            | ✓                         |                |
| a mistake you made in an exercise     | ✓                         |                |
| German you pasted into `/text`        |                           | ✓              |
| your writing, your answers, your deck |                           | ✓              |

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
- **Video** — Deutsche Welle, _Nicos Weg_, streamed from DW's own CDN via the
  three official video podcast feeds, the same way a podcast client would.
  Nothing is downloaded or re-hosted and no captions are scraped; the
  transcripts in `segments_json` are typed by whoever marked the video up. A few
  extras that are not in the podcasts stay as YouTube embeds.
- **Scheduling** — [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), MIT.

Practice tests are built from this app's own content. They are **not** the
official Goethe Modellsatz and predict nothing; the real ones are free PDFs from
the [Goethe-Institut](https://www.goethe.de/de/spr/kup/prf.html).

---

## Known gaps

- **All 231 videos are in and play; none is segmented yet.** The complete
  Deutsche Welle _Nicos Weg_ course — 226 episodes across A1, A2 and B1 — plus 5
  YouTube extras DW does not publish in its podcasts. 33 of the 40 A1 units are
  linked to the episode their title matches; the other seven have no honest
  match and get no video day.

  This entry used to say _"none has segments, so the video block still never
  appears — that is correct, not broken"_. It was not correct. Requiring
  segments meant the block had never been shown to anyone, and the only way that
  could be reported was "I don't find the video player". An episode plays
  unsegmented and says so; segments add per-sentence replay on top.

  That remaining work is deliberately human. A segment is a timestamp plus the
  line actually spoken, and the only way to know the line is to listen to it —
  generated "transcripts" would be subtitles that disagree with the audio, which
  is worse than no video because a learner would believe them.

  **Paste the manuscript first.** DW publishes one for every Nicos Weg lesson on
  learngerman.dw.com. With it in the box at `/admin/video`, the words are
  already there and marking a line is two keypresses — `[` at the start, `]` at
  the end, next line loads itself. Without it you are transcribing and listening
  at the same time, which is what makes it slow. The timings still come from a
  person either way; that is the part that has to match the audio.

  There is no shortcut past that. Checked: the mp4s carry no subtitle track,
  DW's CDN serves no sidecar `.vtt`/`.srt`, and their GraphQL exposes a
  `subtitles.subtitleUrl` field whose Nicos Weg nodes could not be reached
  through the public search.

  The editor is a work queue: unsegmented first, in episode order, with the unit
  each belongs to and a count of what is left.

  ```bash
  npm run videos                # verify the catalogue, then seed
  npm run videos -- --check     # verify only, write nothing
  npm run videos -- --refresh   # re-pull DW's feeds, rewrite the catalogue
  npm run videos -- --prune     # drop db rows the catalogue dropped —
                                # only ones with no segments, never your work
  ```

  Unit assignment is also left to a person. DW's "Einheit" is DW's course
  structure, not this app's twenty-units-per-level one, and mapping 226 episodes
  onto 120 units by arithmetic would put the wrong video in a lesson silently.
  Level is set, which is what the queue sorts by; the unit is chosen while
  watching, which is when you are segmenting it anyway.

  **Commit the work when you have done some.** Segments are saved to the
  database, not the repo, so `npm run export-content` writes them into
  `data/videos.json` (and any generated mnemonics into `data/mnemonics.json`).
  Commit those and every clone gets them; without it, ten hours of marking up
  lives on one laptop and dies with it.

- **Speech recognition needs Chrome, Edge or Safari.** Firefox has never shipped
  the Web Speech API. Speaking and voice mode degrade to listen-and-repeat there
  and say which browsers work. This is feature-detected, so the day Firefox
  ships it, it turns on with no code change.
- **39 of the 80 units past A1 teach vocabulary and no rule** — down from 56,
  and the remaining ones are thematic on purpose. _Im Restaurant_ teaches how to
  order, not a new rule, and forcing one onto it would be padding.

  The 56 was not a content gap. `build-units.mts` spaced each level's grammar
  points evenly across its twenty units — `floor(20 / 6)`, so units 1, 4, 7, 10,
  13, 16 — which is fair-sounding arithmetic that put every point on the wrong
  unit. B1.1 unit 2 is _"Höflich bitten · use Konjunktiv II to be polite"_ and
  taught no rule; unit 4, about the passive, taught Konjunktiv II. The
  blueprints name their own point now, and `tests/grammar-map.test.mts` checks
  the database agrees with them.

  Four points genuinely had nothing written and were added: **als/wenn/wann**,
  **Plusquamperfekt**, **irreale Bedingungssätze**, and **the passive with a
  modal** — the sentence shape every contract and form is written in.

- **A1 has no conversation scenarios.** `Gespräch` is slot 7 of the daily
  rhythm and never fires below A2.1, which has all twenty. A unit with no
  scenario now produces no block rather than a broken one — it used to store
  the four characters `"null"`, which is truthy, and take the whole session
  down at block five.

### Closed since

- ~~The Progress page is eleven sections in flat order.~~ Now four named bands —
  _Was kannst du · Wie läuft es · Was hakt · Nebenbei_ — each showing the
  question it answers. Named after questions rather than after data, so anything
  answering no question a learner actually asks sits at the bottom.
- ~~`/alltag` needs the network.~~ All of them now carry a scripted branching
  dialogue, so they run with no key, no budget and no signal. They were the last
  scenarios in the app without one, and the worst ones to be missing it: these
  are what you rehearse the night before, often on a phone. The live model
  conversation is still the better path when it is available.
- ~~Six scenarios is a corner, not a section.~~ Twelve now, and the six added
  are the ones that actually recur: the Apotheke, the Krankenkasse, collecting a
  parcel, the Ausländerbehörde, phoning a Handwerker, and reading a
  Nebenkostenabrechnung. `tests/content.test.mts` and `tests/scene.test.mts`
  both asserted `=== 6`, so adding any would have turned them red — they check a
  floor and a duplicate-id rule now, which is what they meant all along.
- ~~Tap targets are desktop-sized.~~ The header links were 23px tall, the
  "← back" links 19px, and the tour's step rail 4px, against a 44px guideline.
  `TAP` in `src/lib/ui.ts` is an invisible `::after` that widens the hit area
  without moving the text; the places where two controls sit close enough for
  overlays to collide got real padding instead. Measured at 375px across twenty
  pages: nothing under 30px, and no overlay covering another control.
- ~~The closing review card said the grade "goes out as soon as you move on".~~
  A five-second timer sent it and advanced the block on its own, and the Z it
  offered expired silently at the same moment. It counts down now and says what
  it does. Checked the whole loop in a browser: Z inside the window restores the
  card and sends **nothing**.
- ~~"1 NEUE WÖRTER".~~ `lib/plural.ts` already existed and `/woche` was using it
  properly; the recap and the home screen were not. An app teaching German
  should not print broken German.
- ~~The recap under-reported the session you had just finished.~~ Blocks send
  grades fire-and-forget so the next card is instant, and `/api/session` counts
  today's attempt rows — so the recap raced the final grade and reported one
  review fewer. Caught by grading exactly one card and reading **0
  Wiederholungen** on a screen whose row was already in the database.
  `outbox.ts` tracks in-flight sends now and `finish()` awaits `settled()`
  before asking for the numbers. Same screen as §21, different cause.
- ~~Two React errors nobody had opened the console to see.~~ `FixBlock` and
  `GrammarBlock` called `onDone()` **during their own render**, setting state on
  the session runner mid-render; both return early, so `SkipToNext` does it from
  an effect instead. And `Empty` wrapped its children in a `<p>` while callers
  passed prose that was already one — invalid HTML and a hydration mismatch on a
  page that looked perfect.
- ~~An expired session crashed `/wortschatz`.~~ `fetch` does not throw on 401,
  so the body parsed with every field undefined and `topics.map` took the page
  down. The route had been returning `signIn: "/anmelden"` for the client to
  follow since multi-user shipped, and nothing read it. `src/lib/api.ts` is the
  client half of `lib/http.ts`: `getJson()` follows the 401, returns null for
  any other failure, and `arr()`/`num()` guard the shape. The failure state is
  honest as well — "Der Server hat nicht geantwortet" with a retry that really
  refetches, not "Keine Wörter gefunden", which would be a claim about your deck.
  `/admin/video` had the same hole and now doesn't.
- ~~"Nebenkostenabrechnung" scrolled the page sideways on a phone.~~ 356px of
  heading in a 327px box. `globals.css` has had a `.break-de` class for this
  since before the bug — it is on every heading that renders content now.

### A note on how these were found

Spec §21 lists a sweep for one failure shape: a feature that renders correctly
over a mechanism that is not connected. It found nine, including a conversation
tracker that could never be true, an offline queue for written texts that stored
nothing, and a sentence rotation reaching 6% of the corpus behind a comment
claiming it covered all of it.

Ten passes, each finding what the one before it structurally could not:

|                                  |                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| reading the code                 | disconnected mechanisms, dead columns, drifted duplicates                                                  |
| reading the rendered HTML        | a button printing `&apos;` — the source looked like the working case                                       |
| **doing an hour of German**      | a recap that reported the session had not happened                                                         |
| asking what reads each constant  | five config values that documented a decision they no longer controlled                                    |
| walking a session end to end     | two numbers, both correct, one lying by placement                                                          |
| **deleting the comments**        | a cookie nothing writes, and a constant named twice                                                        |
| **reading the server log**       | one deprecation warning in 6,272 lines, for a convention that will stop working                            |
| **running the suite four times** | a 40% flake whose checks always passed — a red that meant nothing                                          |
| **doing another hour of German** | a screen that lied about its own timer, broken German in the recap, and a compound noun wider than a phone |
| **reading the browser console**  | the recap racing the grade it was counting, and two React errors nobody had opened the panel to see        |

The third is worth the detail. The recap counters animate up from zero with
`requestAnimationFrame`, browsers do not run rAF in a background tab, and there
was no fallback — so finishing a session and locking your phone left **0 Minuten
· 0 neue Wörter · 0 %** on the screen the code itself calls "the screen that
decides whether you come back tomorrow". The database had it all along.

The same pass caught the conversation tracker still broken one commit after
being fixed: the fix had gone into the live path, which needs an API key, while
the scripted fallback — the only path that runs without one — was untouched.

The fourth pass is the cheapest and the one most worth stealing: for every
constant in `config.ts`, ask what imports it. Five imported nothing. They looked
authoritative, the app behaved exactly as documented, and changing them did
nothing — the file had quietly become a comment. `tests/config.test.mts` asserts
the connection now, because the failure leaves no other trace.

The fifth was a full session in a browser, and what it found was not a broken
number but a **misplaced** one: the session chrome says "72 min übrig", the
review block replaces that chrome and said "≈ 2 min übrig" in the same corner
about the eleven cards in front of you. Both true. Together, a lie.

The sixth was an accident and is the best argument for the whole exercise.
Deleting a comment means reading the line under it against what the comment
claims, one line at a time, over every file — which is a code review nobody
would schedule and everybody would benefit from. It found `who.ts` reading a
cookie nothing writes and `TUTOR_CACHE_TTL` named twice. Both had a comment
sitting directly above them, confidently describing the intended behaviour, and
in both cases the comment was the reason nobody looked at the line.

The seventh cost nothing and should be a habit: read the server log. Six
thousand lines of it, and the only thing in there was one deprecation warning
for a file convention Next will eventually stop supporting. Warnings scroll past
during development and get read as noise; the one that matters looks exactly
like the ones that don't until you grep the whole log at once.

The eighth is the same idea applied to the tests: run them **more than once**.
One run is a sample of one, and a suite that fails two runs in five looks
perfectly healthy the three times you happen to look. Both the flake and the
line-ending problem above were found this way — by re-running something that had
already said it was fine.

The ninth is the third one again, and it keeps paying. Sitting through another
session — sign in with the form, grade a card, undo it, finish, read the recap —
found a screen lying about its own five-second timer, two counters printing
broken German, a page header saying "six" over a list of twelve, and a compound
noun 29px wider than a phone. Every one is invisible to the type checker, the
linter, the tests and the dead-code pass, all of which were green throughout.

The tenth is the cheapest of all and had never been done: **open the console.**
Three faults sat there, and the app looked correct on screen for every one of
them — a recap racing the grade it was counting, a block setting state on its
parent mid-render, and a `<p>` nested in a `<p>` producing a hydration mismatch.
None is visible from the outside until the day it isn't.

It also came with its own trap. The console buffer carries messages across
navigations, so after fixing all three it still listed them and would have been
read as "not fixed". A **fresh tab** is the only honest reading, and it was
silent.

If you are reading this repo to judge it, read §21, §24 and §25 first.
