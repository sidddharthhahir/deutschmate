# DeutschMate

A self-hosted German learning app focused on practical, everyday use in Germany.

## Overview

DeutschMate is a structured daily-study platform designed for consistent progress from A1.1 to B1.2. It combines guided sessions, spaced repetition, grammar, listening, speaking, and scenario-based practice in one local-first application.

## Key Features

- Guided daily learning flow with fixed study rhythm
- Vocabulary and sentence practice backed by spaced repetition (FSRS)
- Practical life-in-Germany scenarios and conversation practice
- Optional AI-powered assistance using each learner’s own API key
- Local-first setup with self-hosted data and multi-user support

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

## Contribution

Contributions are welcome. Please open an issue to discuss significant changes before submitting a pull request.

## License / Contact

No license file is currently included in this repository. For usage questions, support, or collaboration, please open a GitHub issue in this repository.
