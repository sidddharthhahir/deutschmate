"use client";

/* ".ts" on purpose: tests/blocks.test.mts imports this table under plain Node,
   which does not resolve an extensionless path the way Next does. */
import { myKey } from "./who.ts";

/**
 * What each block is, said at the moment you meet it.
 *
 * The tour on /willkommen explains all of this once, before the first session —
 * which is the one moment none of it is needed yet. Reported from real use:
 * "I have clicked ▶ Heutige Sitzung and I literally don't understand what is
 * happening." The answer is not a longer tour. It is a sentence in front of the
 * thing it describes.
 *
 * English, like every other explanation of how the app works; the German stays
 * on the content. Same rule as the tour.
 */

export type Intro = {
  /** One line, under the block name, every single time. */
  line: string;
  /** The first-time card. Short paragraphs — this is a doorway, not a manual. */
  body: string[];
  /** Keys worth knowing here, as [key, what it does]. */
  keys?: [string, string][];
  /**
   * The same list for a finger. Shown instead of `keys` on a coarse pointer,
   * because a phone has no Leertaste and telling somebody to press one is
   * worse than saying nothing. Every control named here is a real button.
   */
  touchKeys?: [string, string][];
};

/*
 * Keyed by block kind, except review, which is two genuinely different screens:
 * on an audio day the word is played and stays hidden, and an intro promising
 * "you see a word" would be describing a screen with no word on it.
 */
export const INTRO: Record<string, Intro> = {
  review: {
    line: "Cards that are due back today",
    body: [
      "Words and rules you have met before, returning on the schedule that decides when you were about to forget them.",
      /* Device-neutral on purpose. The legend below carries the key or the
         button; saying "Space" up here would be wrong on a phone, and keeping
         two copies of the same paragraph in step is a losing game. */
      "You see the German, reveal the meaning, then say how well you actually knew it — four grades, from no idea to instant. Grade honestly: the schedule is built out of what you tell it, and nobody else ever sees these numbers.",
    ],
    keys: [
      ["Leertaste", "show the answer"],
      ["1 – 4", "again · hard · good · easy"],
      ["R", "hear it again"],
      ["Z", "undo that grade, for five seconds"],
    ],
    touchKeys: [
      ["Aufdecken", "show the answer"],
      ["Four buttons", "again · hard · good · easy"],
      ["▶", "hear it again"],
      ["Zurücknehmen", "undo that grade, for five seconds"],
    ],
  },
  "review-audio": {
    line: "The same due cards, heard before they are seen",
    body: [
      "The same cards as Aufwärmen, but the word is played first and stays hidden. Catch it by ear if you can — recognising German spoken at speed is the part that a written deck never trains.",
      "No sound, or you would rather just read it? „Wort zeigen“ shows the word. It costs you nothing — the grade is still yours to give.",
    ],
    keys: [
      ["R", "play it again"],
      ["Leertaste", "show the word"],
      ["1 – 4", "again · hard · good · easy"],
    ],
    touchKeys: [
      ["▶", "play it again"],
      ["Aufdecken", "show the word"],
      ["Four buttons", "again · hard · good · easy"],
    ],
  },
  fix: {
    line: "Your commonest mistakes, drilled",
    body: [
      "Not a syllabus topic — these are the three things you have actually been getting wrong this week, taken from your own answers.",
      "A few short drills each. They disappear from here once you stop making them.",
    ],
  },
  cloze: {
    line: "Gaps built from sentences you got wrong",
    body: [
      "Every sentence here is one you have already met and answered wrongly. The blank is the exact word you missed.",
      "Type the missing word. If a gap is not worth keeping — a typo, a name — you can throw it away and it will not come back.",
    ],
  },
  "grammar-review": {
    line: "Rules coming back on the same curve as words",
    body: [
      "A grammar point you have already been taught, due back. Rules are forgotten the same way vocabulary is, so they are scheduled the same way.",
      "Graded the same way as Aufwärmen — four grades, from no idea to instant.",
    ],
  },
  "new-vocab": {
    line: "Today's new words, one at a time",
    body: [
      "The new words for today, at most twelve, and fewer if your accuracy has been slipping.",
      "Each one is shown with its meaning and an example — then Verstanden, and you pick the meaning back out of four. It is a check that it landed, not a memory test, but the answer is recorded and it counts towards the accuracy that decides tomorrow's pace.",
      "Every word here becomes a card, and comes back in Aufwärmen.",
    ],
  },
  "new-grammar": {
    line: "One rule, with examples and a few drills",
    body: [
      "A single grammar point, explained and then practised.",
      "This replaces new vocabulary for the day. The course never gives you both in one session — a rule and twelve new words on the same evening is how a day gets skipped.",
    ],
  },
  listening: {
    line: "Hear a sentence, type what you heard",
    body: [
      "Listen and write it down. You can replay as often as you like; nothing is counted until you answer.",
      "The umlauts are one tap or one shortcut away — whichever your device has, it is below.",
    ],
    keys: [
      ["R", "play it again"],
      ["Alt + a o u s", "ä ö ü ß"],
    ],
    touchKeys: [
      ["▶", "play it again"],
      ["ä ö ü ß", "the bar above the keyboard"],
    ],
  },
  reading: {
    line: "A short text, then a few questions",
    body: [
      "A text written for the level you are at. Read it once through before worrying about the words you do not have.",
      "Tap any word to see what it means, and keep the sentence as a card if it is worth keeping. The questions come after.",
    ],
  },
  video: {
    line: "Ninety seconds of real German, at your level",
    body: [
      "An episode of Nicos Weg — Deutsche Welle's A1–B1 drama course — picked for the unit you are on. About a minute and a half.",
      "Watch it once without trying to catch everything, then again. Where the sentences have been marked up you can tap one to replay just that line; most episodes have not been, and watching is the point either way.",
    ],
  },
  builder: {
    line: "Build the German sentence from the tiles",
    body: [
      "You get the English. Assemble the German from the word tiles below it.",
      "Tap a word to place it, tap it again to take it back. When you get one wrong, you are told what the right sentence was and why — the explanation is about the rule you missed, not just the letters.",
    ],
  },
  conversation: {
    line: "A conversation you will actually have here",
    body: [
      "The other side of a real situation — a flat viewing, the Bürgeramt, a doctor. Answer in German.",
      "It only uses words you have already met. Corrections wait until the end: being interrupted mid-sentence is how people stop speaking.",
    ],
  },
  writing: {
    line: "A few sentences of your own",
    body: [
      "Write to the prompt using words from this unit. Length matters less than finishing a thought.",
      "It is corrected after you send it, and whatever you got wrong turns up in tomorrow's Fix block. Written offline, it is queued and corrected when you reconnect.",
    ],
  },
  speaking: {
    line: "Say it out loud",
    body: [
      "Your browser's own speech recogniser listens and marks which words it caught. It will ask for the microphone once.",
      "What you see is the real recognition result, word by word — this app will not invent a pronunciation score out of a hundred, because it cannot honestly measure one.",
    ],
  },
  quiz: {
    line: "Eight questions from what you touched today",
    body: [
      "The end of the session. The questions are built from what actually went past you in the last hour, not from a fixed test.",
      "Go through to the recap after it — that is the screen that saves the session.",
    ],
  },
};

/**
 * Which intro a block gets. Review splits in two: the audio-first day is a
 * different screen, not a different wording.
 */
export function introKey(kind: string, payload: unknown): string {
  if (kind === "review" && (payload as { audioFirst?: boolean })?.audioFirst)
    return "review-audio";
  return kind;
}

const BASE = "dm.blockintro.v1";

/**
 * The doorways this learner has already been through.
 *
 * Null means localStorage could not be read — private mode, or a corrupted
 * blob — and the caller should treat every intro as seen. A card that cannot
 * record its own dismissal is a card you meet again every single day.
 */
export function loadSeenIntros(): Set<string> | null {
  try {
    const raw = localStorage.getItem(myKey(BASE));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return null;
  }
}

export function markIntroSeen(key: string) {
  try {
    const raw = localStorage.getItem(myKey(BASE));
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    if (!seen.includes(key)) seen.push(key);
    localStorage.setItem(myKey(BASE), JSON.stringify(seen));
  } catch {
    /* worst case it shows once more */
  }
}

/** Forget them all, so /willkommen can hand back a genuine first run. */
export function resetIntros() {
  try {
    localStorage.removeItem(myKey(BASE));
  } catch {
    /* nothing to do */
  }
}
