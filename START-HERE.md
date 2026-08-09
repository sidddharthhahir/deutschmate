# Start here

A German course that decides what you study. You press one button a day and it
teaches, drills, listens, corrects and remembers for you. A1.1 → B1.2, about an
hour a day, roughly seven months.

It runs on your own laptop. Nothing is sent anywhere, and it costs nothing.

---

## Setting it up

You need **Node 24 or newer** ([nodejs.org](https://nodejs.org)) and **git**.
Check with `node --version` — if it says 24 or higher you are fine.

```bash
git clone https://github.com/sidddharthhahir/deutschmate.git
cd deutschmate
npm install
npm run setup
npm run dev
```

Then open **http://localhost:3000**.

`setup` builds the whole course on your machine — 3,219 words, 120 units, 49
grammar points, 2,381 recordings. It takes a couple of seconds and needs no
internet and no account anywhere.

> **On Windows, clone somewhere short.** `C:\Users\you\deutschmate` is fine.
> A deeply nested folder breaks the build with a confusing `FATAL` error that
> never mentions the path. Nothing to debug — just move it.

---

## The first two minutes

1. Pick **Konto erstellen**, choose a username and a password.
2. **Write down the recovery code it shows you.** It appears once. There is no
   email to send a reset to, so it is the only way back into your own account.
3. Take the six-screen tour. It is short and it explains the one rule below.

After that the device stays signed in. You will not be asked again.

---

## The one rule

**Go to the end of the session.** The recap screen is what saves it — quit
before that and nothing is recorded: no streak, no cards scheduled. If you have
ten minutes instead of an hour, use **Kürzere Sitzung heute** under the main
button. That still counts.

Press <kbd>Enter</kbd> on the home screen and it starts. Inside a session,
<kbd>Enter</kbd> is always the one button on screen, <kbd>1</kbd>–<kbd>4</kbd>
picks an answer, <kbd>R</kbd> plays the audio again, and <kbd>?</kbd> lists the
rest. <kbd>Esc</kbd> leaves.

Be honest with the four grade buttons. The schedule is only as good as what you
tell it, and nobody is looking.

---

## What works without a key

Everything except four things: the AI conversation, written-text correction,
"erklär mir das" explanations, and mnemonics.

You still get the full course without them — every word, every grammar point,
readings, listening, speaking, the spaced repetition, practice exams, and the
whole of A1 conversation, because those 40 units ship a written-out dialogue
that runs with no key and no internet.

If you want the rest, put your own Anthropic key in **Einstellungen**. It costs
about **€2–3 a month** at an hour a day, you set your own ceiling, and it is
your key and your bill — not Sid's.

---

## Worth knowing

- **On your phone:** run `npm run dev:lan` instead, open the address it prints,
  and add it to your home screen. It installs like an app.
- **Speaking needs Chrome, Edge or Safari.** Firefox has never supported the
  browser speech API. Everything else works there.
- **Back it up:** `npm run backup`, about once a week. Your progress lives only
  on your laptop — it is deliberately not in the repo, which is also why your
  deck and Sid's never touch each other.
- **Videos play but have no per-sentence replay yet.** That part is hand-made
  and mostly not done.

---

## If something looks wrong

Tell Sid — especially anything that feels wrong rather than looks broken. A
number that seems too good, an explanation that does not match your mistake, a
session that felt off. Those are the ones worth catching, and most of what has
been fixed so far was found exactly that way.

`npm run config` prints every setting the app is actually using and flags
anything misconfigured, which is usually the fastest answer.

Viel Erfolg.
