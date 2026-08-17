# Start here

A German course that decides what you study. You press one button a day and it
teaches, drills, listens, corrects and remembers for you. A1.1 → B1.2, about an
hour a day, roughly seven months.

It runs on your own laptop and it costs nothing. Almost nothing leaves the
machine — the two exceptions are named under "Worth knowing" below, because a
promise with unlisted exceptions is not a promise.

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

**Go to the end of the session.** Every grade is saved the moment you give it,
so your deck and its schedule survive quitting early — that much is never lost.
What the recap screen records is everything around it: the streak, the minutes,
and the unit you just finished. Quit before it and none of that counts. If you
have ten minutes instead of an hour, use **Kürzere Sitzung heute** under the
main button. That still counts.

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

## Or: one install, two people

If you would rather not run any commands, the other person can host it and you
just open a link. You still get your own account, your own deck, your own
streak and your own key — one install, two separate courses. What you share is
the explanation cache, so whoever meets a sentence first pays for the answer
and the other gets it free.

**The catch:** their machine has to be awake and running it whenever you want
to study. That is the whole trade.

On the machine doing the hosting:

```bash
npm run build      # once, and after every git pull
npm run start:lan
```

Not `npm run dev` for this. Dev mode is built for one person reloading their
own code and drifts past a 15 GB heap after an evening; the production server
measured 224 MB and stayed there.

The server prints `http://0.0.0.0:3000`. That is not an address anybody can
open — it only means "listening on every interface". The one the other laptop
needs is this machine's own address on the network: run `ipconfig` (`ifconfig`
on macOS), take the IPv4 address of the Wi-Fi adapter — something like
`192.168.0.246` — and open `http://192.168.0.246:3000` from the other laptop.

Two things usually block it, both on the host: the firewall (Windows blocks
incoming connections to Node by default) and the address changing when the
router hands out a new one. Ask whoever set it up.

## Worth knowing

- **On your phone:** run `npm run dev:lan` instead, open the address it prints,
  and add it to your home screen. It installs like an app.
- **Speaking needs Chrome, Edge or Safari.** Firefox has never supported the
  browser speech API. Everything else works there.
- **Speaking also sends your voice to Google, and needs internet.** This is the
  first of the two exceptions. Chrome does not recognise speech on your machine
  — it uploads the audio to Google's servers and sends back the text. That
  applies to Sprechen and to Minimalpaare, and to nothing else. Every other
  exercise, including all the audio you listen to, is local. If that is not a
  trade you want, skip those two; they are skippable on purpose.
- **The AI features send text to Anthropic, if you turn them on.** The second
  exception, and only if you put in a key: the conversation, written
  correction, explanations and mnemonics. Without a key nothing is sent and
  those four are simply off.
- **Backups now happen on their own.** The first session you finish each day
  writes a snapshot into `backups/`, and the newest fourteen are kept. You do
  not have to remember anything. `npm run backup` still exists and additionally
  writes a JSON export, which is what `npm run restore` reads; a snapshot is
  restored by copying it over `deutschmate.db`. Your progress lives only on
  your laptop — deliberately not in the repo, which is also why your deck and
  Sid's never touch each other.
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
