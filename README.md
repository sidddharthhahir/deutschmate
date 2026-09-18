# DeutschMate

A self-hosted German learning app focused on practical, everyday use in Germany.

## Overview

DeutschMate is a structured daily-study platform for consistent daily German practice. It combines guided sessions, spaced repetition, grammar, listening, speaking, and scenario-based practice in one local-first application: the deck is 3,120 words, browsable in Wortschatz regardless of which levels have a course built on top of them, and a session introduces at most twelve new ones a day. The course currently ships A1.1, rebuilt around the Momente A1.1 textbook; A1.2 through B1.2 are being rebuilt the same way and are not shipped yet (see `data/deferred/README.md`).

## Key Features

- Guided daily learning flow with fixed study rhythm
- Vocabulary and sentence practice backed by spaced repetition (FSRS)
- Practical life-in-Germany scenarios and conversation practice
- Optional AI-powered assistance using each learner’s own API key
- Local-first setup with self-hosted data and multi-user support

## Course Content

`npm run setup` builds the whole course locally from `data/` — 3,120 words, 12 units, 15 grammar points, 6 readings, 1,827 levelled sentences, 955 prebuilt explanations and 231 Deutsche Welle video episodes — with no network access and no API key required.

All of that costs nothing and needs nothing: 3,120 words, 12 units, 15 grammar points, 6 readings, the FSRS review engine, and **955 prebuilt explanations**, so a wrong answer always comes back with a reason. Only four features call a model — conversation, written-text correction, "erklär mir das" explanations, and mnemonics — each billed to the learner's own key.

| Route           | What it is                                              |
| --------------- | -------------------------------------------------------- |
| **Sitzung**     | The daily session — reviews, new material, a quiz.       |
| **Wortschatz**  | All 3,120 words, 1,526 of them with native audio.         |
| **Üben**        | Focused practice: scenarios, grammar, pronunciation.      |
| **Fortschritt** | Progress tracking — every number traceable to a DB row.   |

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Node.js 24+
- SQLite via `node:sqlite`

## Setup & Run

1. Clone and install dependencies:

```bash
git clone <your-repo-url> deutschmate
cd deutschmate
npm install
```

2. Initialize local data and environment:

```bash
npm run setup
```

3. Start development server:

```bash
npm run dev
```

4. Open the app in your browser and create an account.

### Optional: Access from phone/LAN

```bash
npm run dev:lan
```

## Usage

- Use the main session flow for your daily study cycle.
- Track progress in the progress/dashboard views.
- Use practice sections for focused grammar, speaking, and review.
- Add a personal Anthropic API key in settings to enable AI-supported features.

## Project Structure

```text
src/
  app/          # Next.js app routes and pages
  components/   # Reusable UI components
  lib/          # Core learning logic and utilities
scripts/        # Setup, import, maintenance, and content scripts
data/           # Course/content source data
tests/          # Test runner and test suites
```

## Accessibility

Known gap, not an oversight: the primary button color (hot pink fill, cream
text — `--dm-accent` / `--dm-accent-fg` in `src/app/globals.css`) measures
roughly **2.84:1** contrast, below WCAG AA's 4.5:1 for normal-size text. This
is the current brand color, kept deliberately rather than changed
automatically — darkening it is a design decision for the team to make
before a wider rollout, not something to fix quietly as a side effect of an
unrelated change. See `DESKTOP_UX_VERIFICATION_REPORT.md` for how this was
measured.

## Contribution

Contributions are welcome. Please open an issue to discuss significant changes before submitting a pull request.

## License / Contact

Licensed under [MIT](LICENSE). For usage questions, support, or collaboration, please open a GitHub issue in this repository.
