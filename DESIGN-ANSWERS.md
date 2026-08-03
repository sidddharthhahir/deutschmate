# Answers to your questions

---

**1. Packaging** — as you proposed. Artifacts + design system + one screen in
four states.

**2. Scope** — **deep on three, then the system.** Home, review card, recap.
The review card is seen ~60 times a day for six months; if its rhythm is wrong
nothing else matters. Once those three are right the rest follows the tokens.

**3. Viewport** — **mobile first, verified at desktop.** My flatmate is on a
phone and the review card has four tap targets that must work one-handed.
Desktop then gets keyboard flow, which mobile can't have anyway.

---

**4. The session blocks, in order**

The rail is **variable length, 6–8 blocks** — that is a real design constraint,
not a simplification. Titles exactly as they appear:

| # | Title | Notes |
|---|---|---|
| 1 | **Aufwärmen** | always present, never skippable |
| 2 | **Fix** | **only if the learner has recent errors** — often absent |
| 3 | **Neue Wörter** *or* **Grammatik** | never both on the same day |
| 4 | **Hören** *or* **Lesen** *or* **Video** | rotates daily |
| 5 | **Sätze bauen** | |
| 6 | **Sprechen** *or* **Schreiben** *or* **Gespräch** | rotates daily |
| 7 | **Abschluss** | always last |

A real 7-block day: `Aufwärmen · Neue Wörter · Hören · Sätze bauen · Schreiben
· Gespräch · Abschluss`.

Two more states the rail must handle:
- **Wiedereinstieg** — after a 3+ day gap the whole session collapses to **one
  block**, 20 reviews, no new material. The rail can't assume ≥6.
- Blocks 2, 4, 5, 6 are skippable; 1, 3, 7 are not. Skipping shortens the rail
  mid-session.

---

**5. The recap's four numbers — and a correction**

You caught a real error in my brief. `Hören 92% / Sprechen 81%` **is not in the
recap payload** — per-skill accuracy exists only on the Progress page. I wrote
an example from a screen that doesn't produce those numbers. Design the four
below instead.

| Shown | Source |
|---|---|
| **Minuten** | wall-clock: session end − session start, written to `session_log.minutes` |
| **Neue Wörter** | `COUNT(*) FROM attempt WHERE kind='new-vocab' AND date(created_at)=today` |
| **Wiederholungen** | same query, `kind='review'` |
| **Richtig %** | `SUM(correct) / COUNT(*)` over **all** of today's attempts |

Plus two non-numeric elements, both real:
- **Häufigster Fehler** — top tag from `error_tags_json` on today's wrong
  answers, e.g. *"der vs. den (7×)"*. Absent on a clean day; design that case.
- **Morgen** — the next unit's title.

And the can-do tick list, which is the emotional core of the screen — those
statements were promised on Home that morning.

---

**6. Nav — four total, keep as is**

`Home · Wortschatz · Üben · Fortschritt`. Home is the destination, the other
three are links from it. No fifth.

---

**7. The streak — keep it, but make it quiet**

Fair challenge, and the distinction matters. I banned XP, badges, achievements
and leaderboards — **invented** rewards. The streak is a **count of
consecutive days present in `session_log`**. It passes principle 4 because it's
a fact about what happened, not a score I made up.

But you're right that `Tag 23 🔥` is styled like a reward. Design it as data:
same weight as the level and unit number, no flame, no colour, no animation.
If it disappeared nobody should feel punished — and one rest day a week doesn't
break it.

---

**8. Article colour — the article word only**

Colour the article, never the noun: **der** Bahnhof, not *der Bahnhof*.
Everywhere a noun appears with its article — review card, Wortschatz row, word
detail, reading glosses.

Currently sky / rose / emerald. Replace it if you can do better, but keep three
distinct, memorable, colourblind-safe hues, and **never let colour be the only
carrier** — the article word is always written out too. This is a mnemonic, not
a status indicator.

---

**9. Grade buttons — three non-colour carriers**

1. **Fixed left-to-right order** = increasing ease. Never reorder, ever. Muscle
   memory is the whole point.
2. **The number key** printed on each button — 1 2 3 4.
3. **The hint line** — *no idea / slowly / knew it / instant*.

A colourblind user at speed must be able to hit **Gut** without reading. That
means position and size do the work; colour is confirmation only.

---

**10. Four-state screen — Home**

All four states are genuinely reachable there and it's where failure is worst:

- **normal** — session ready
- **empty** — nothing due, no new unit (a real state: "du bist durch für heute")
- **offline** — must still start; the session runs offline
- **error** — `/api/session` down, and the app should still let them review

Home is the screen where "can't start" is fatal, so it's the one worth proving.

---

**11. Real data — attached, in `design-export/`**

| File | |
|---|---|
| `vocabulary.csv` | all 2,400 words: article, plural, POS, gloss, level, example |
| `units.csv` | all 120 units with can-do statements |
| `samples.json` | real review cards, real Wortschatz rows, real error labels, real offline messages, **and the longest string in every field** |
| `routes.md` | all 19 routes and the 11 block types |

The longest-strings block is the one to design against:
- longest German word: **Vorstellungsgespräch** (20 chars)
- longest can-do: **"say whether you're going somewhere or already there"** (51)

---

**12. Where I already suspect the structure is wrong**

Four honest candidates — dig hardest here:

**a) Home lists all seven blocks — that may violate my own principle.** The
point of one button is *no decisions*. Showing the itinerary might reassure, or
might just be a menu I've drawn as a list. I don't know which. Test it.

**b) Two competing progress indicators in the session.** The rail shows
block 3 of 7; inside the block a bar shows card 12 of 60. They compete, and the
one that matters ("how much longer") is the one I don't show.

**c) "Abschluss" means two different things** — the closing quiz *and* the
recap. Same word, two screens, blurred boundary.

**d) Two routes into the deck.** The session introduces new words; Wortschatz
has a `+ Deck` button. Both are "learning a word" and I've never made the
difference legible.

**e) The Progress page is six sections with no hierarchy.** It's a data dump. I
don't know what someone should look at first.

---

**13. Design system**

Start with **Nocturne** — the app is dark-first and used at night for an hour
at a time. If you want a second for comparison, **Modernist**, on the grounds
that a study tool should be quiet.

Not **Broadsheet** or **Classical**, despite the reading-heavy content — the
German texts need to feel legible and current, not literary.

Overrule me if you disagree once you've seen the data; you'll know better than
I do after looking at it.
