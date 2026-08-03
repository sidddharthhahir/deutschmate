# Design brief — paste this into a new Claude conversation

---

I need you to design the frontend for **DeutschMate**, a German learning app that
already exists and works. The logic, data and all 19 routes are built in
Next.js 15 + Tailwind + TypeScript. What it has is a *functional* interface, not
a designed one. I want you to design it properly, then I'll build it.

Produce **HTML/CSS artifacts I can look at**, not descriptions. Use real German
content from the examples below — never lorem ipsum, never placeholder English.

---

## What the product is

A complete A1.1 → B1.2 German course for self-study, ~1 hour a day for six
months. Two users right now: me and my flatmate. Not a commercial product.

**The one sentence it's built around:**

> Open the app, press one button, and for the next hour you never decide
> anything — it teaches, drills, listens, corrects, and remembers for you.

## Four principles — these are design constraints, not vibes

1. **One button.** The app decides what you study. Never make the user choose a
   lesson, a skill, or a difficulty. If a design adds a decision, it's wrong.
2. **Offline-first.** A full session must be finishable in airplane mode. Every
   screen needs an offline state that is *calm*, not an error.
3. **Vocabulary-constrained.** Text shown to the learner only uses words they
   already know. Nothing in the UI should feel like it's showing off.
4. **Never fake progress.** Every number on screen traces to a database row.
   No estimated CEFR level, no "87% pronunciation", no invented confidence.
   **If you design a stat, tell me which real number it shows.**

## Real scale — design for this, not for five items

| | |
|---|---|
| Vocabulary | 2,400 words, 2,373 with native audio |
| Units | 120, across 6 levels (20 each) |
| Grammar points | 36 |
| Readings | 38 |
| Reviews due on a normal day | 40–90, hard-capped at 60 |
| A session | 6–8 blocks, ~60–78 minutes |

---

## Screens to design

### Priority 1 — design these properly

**1. Home.** The most important screen. One primary action. Currently shows:
greeting + level + unit + streak, today's can-do statements, one big button
with duration and counts, a list of the session's blocks, three nav links.

The emotional job: *you should not be able to open this and not start.*

**2. Session runner shell.** A progress rail across 7 blocks, a way out, and
the current block's title. It must show where you are without offering a choice
about where to go next. Runs for an hour — low eye strain matters.

**3. Review card (flashcard).** The block used most: ~60 cards a day, every
day, for six months. Word, audio button, reveal, then four grade buttons
(Nochmal / Schwer / Gut / Einfach). Speed and rhythm matter more than beauty —
a keyboard user should be able to hold a steady pace without moving their hand.

**4. Sentence builder.** English sentence at the top, German word tiles below,
an empty slot to arrange them in. On a wrong answer an explanation appears
saying *why*. Needs to feel tactile.

**5. Daily recap.** End of session. Tick off the can-do statements, show four
real numbers, name the most common mistake, preview tomorrow. This is the
screen that makes someone come back — design it like it matters.

### Priority 2 — design the pattern, not every instance

**6. Wortschatz** — browsable list of all 2,400 words. Filters, 50–100 a day,
"+ Deck" per row. Dense list design; must stay scannable at 100 rows.

**7. Progress** — counts, per-skill accuracy bars, 120-unit list, error tags,
a 30-day time chart.

**8. Reading block** — a German text where every word is tappable for a gloss,
followed by comprehension questions.

**9. Conversation block** — chat with the AI tutor. Also needs a *scripted*
offline variant that must not feel like a downgrade.

**10. Word detail page** — everything about one word: forms, audio, examples,
which unit teaches it, your review history, your mistakes with it.

---

## Hard content constraints

**German text is long.** `Grundstücksverkehrsgenehmigung` is one word. Buttons
and labels must survive strings 3× longer than the English equivalent. Test
your layouts with: *Wiedereinstieg*, *Vorstellungsgespräch*, *Arbeitslosigkeit*,
*Krankenversicherungsbeitrag*.

**Umlauts and ß must be unambiguous** at small sizes: ä ö ü Ä Ö Ü ß. Pick a
typeface where they don't collide with the line above.

**Article colour-coding is a real learning aid — keep it.** der = one colour,
die = another, das = a third, applied consistently everywhere a noun appears.
Currently sky / rose / emerald. Improve the palette but keep three distinct,
memorable, colourblind-safe hues.

**Dark by default** (people study at night), but it must work in light too.

**Mobile is not optional** — my flatmate uses this on a phone.

---

## Real content to design with

Home screen:
```
Guten Abend, Siddharth
A1.2 · Unit 14 von 20 · Tag 23 🔥

Heute lernst du
  ✓ order a meal in a restaurant
  ✓ ask what something costs
  ✓ pay and leave a tip

[ ▶ Heutige Sitzung — 58 min · 34 Wiederholungen · 12 neue Wörter ]
```

Review card:
```
der Bahnhof          →  station
Plural: die Bahnhöfe
Wo ist der Bahnhof?
[Nochmal] [Schwer] [Gut] [Einfach]
```

Sentence builder:
```
"I'm eating an apple."
tiles:  Apfel · esse · einen · Ich
answer: Ich esse einen Apfel.
error:  "einen, not ein — Apfel is masculine and it's the object here."
```

Wortschatz row:
```
die  Entwicklung, -en        development
     Die Entwicklung dauert lange.       🔊   [+ Deck]
     ↳ Unit 88 · B1.1
```

Recap:
```
Heute geschafft                      58 min
12 neue Wörter        56 Wiederholungen
Hören 92%             Sprechen 81%
Häufigster Fehler:    der vs. den  (7×)
Morgen:               Restaurant-Wortschatz
```

Offline banner: `Offline — Ersatzübung statt Video`

---

## Do not

- Generic AI aesthetics: Inter/Roboto/system fonts, purple-on-dark gradients,
  glassmorphism, predictable card grids
- Gamification — no XP, badges, achievements, leaderboards, confetti,
  mascots. Deliberately cut from this product.
- Progress rings or dials showing invented percentages
- More than 4 top-level navigation targets
- Anything that adds a decision to the home screen
- Motion that gets tiring on the 400th flashcard of the week

## Do

- Pick a typeface with real character that stays legible for German at 14px
- Design the **empty, offline and error states** for every screen — for this
  app they're normal states, not edge cases
- Make the four grade buttons distinguishable by shape/position, not colour
  alone
- Show me the **keyboard flow** for the review card — space to reveal, 1–4 to
  grade, r to replay
- Give the recap screen genuine warmth. Everything else can be neutral.

---

## What I want back

1. **Home, review card, and recap** as full HTML/CSS artifacts I can open
2. A **design system**: type scale, colour tokens (incl. the three article
   colours), spacing, border radius, one motion rule
3. **One screen shown in all four states**: normal, empty, offline, error
4. A short note on any place my current structure fights good design — I'd
   rather change the structure than wrap it in nicer CSS

Ask me anything before you start if a decision would change the outcome.
