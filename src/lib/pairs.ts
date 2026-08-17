/** Minimal pairs — two German words differing by exactly one sound. */

export type Pair = {
  sound: string;
  a: string;
  b: string;
  aEn: string;
  bEn: string;
  /** What the mouth actually has to do. One line, no phonetics jargon. */
  tip: string;
};

export const PAIRS: Pair[] = [
  // ---------------------------------------------------------------- ö
  {
    sound: "ö",
    a: "schon",
    aEn: "already",
    b: "schön",
    bEn: "beautiful",
    tip: "Say 'eh' as in bed, then round your lips without moving your tongue.",
  },
  {
    sound: "ö",
    a: "konnte",
    aEn: "could (past)",
    b: "könnte",
    bEn: "could (would be able to)",
    tip: "A whole tense hangs on this one: könnte is hypothetical, konnte happened.",
  },
  {
    sound: "ö",
    a: "Kopf",
    aEn: "head",
    b: "Köpfe",
    bEn: "heads",
    tip: "The plural umlaut moves the vowel forward — lips still rounded.",
  },
  // ---------------------------------------------------------------- ü
  {
    sound: "ü",
    a: "Mutter",
    aEn: "mother",
    b: "Mütter",
    bEn: "mothers",
    tip: "Say 'ee', keep your tongue exactly there, then round your lips.",
  },
  {
    sound: "ü",
    a: "Bruder",
    aEn: "brother",
    b: "Brüder",
    bEn: "brothers",
    tip: "Singular and plural differ only here — worth getting right.",
  },
  {
    sound: "ü",
    a: "Kiste",
    aEn: "box",
    b: "Küste",
    bEn: "coast",
    tip: "Short i with spread lips vs short ü with rounded lips.",
  },
  {
    sound: "ü",
    a: "vier",
    aEn: "four",
    b: "für",
    bEn: "for",
    tip: "Two words you will say constantly, and English gives you no help.",
  },
  {
    sound: "ü",
    a: "Tier",
    aEn: "animal",
    b: "Tür",
    bEn: "door",
    tip: "Same trick: 'ee' tongue, rounded lips.",
  },
  // ---------------------------------------------------------------- ä
  {
    sound: "ä",
    a: "Beeren",
    aEn: "berries",
    b: "Bären",
    bEn: "bears",
    tip: "ä is more open than the e in See — jaw drops slightly.",
  },
  {
    sound: "ä",
    a: "Vetter",
    aEn: "male cousin",
    b: "Väter",
    bEn: "fathers",
    tip: "Short e vs long ä; the length matters as much as the colour.",
  },
  // ------------------------------------------------------------ long/short
  {
    sound: "lang / kurz",
    a: "Staat",
    aEn: "state",
    b: "Stadt",
    bEn: "city",
    tip: "Double a is long, double consonant means the vowel before it is short.",
  },
  {
    sound: "lang / kurz",
    a: "Miete",
    aEn: "rent",
    b: "Mitte",
    bEn: "middle",
    tip: "ie is always long. Two t's cut the vowel short.",
  },
  {
    sound: "lang / kurz",
    a: "bieten",
    aEn: "to offer",
    b: "bitten",
    bEn: "to ask",
    tip: "Hold the ie for a full beat; the i in bitten is clipped.",
  },
  {
    sound: "lang / kurz",
    a: "Ofen",
    aEn: "oven",
    b: "offen",
    bEn: "open",
    tip: "Same rule: one f, long o. Two f's, short o.",
  },
  {
    sound: "lang / kurz",
    a: "fühlen",
    aEn: "to feel",
    b: "füllen",
    bEn: "to fill",
    tip: "Both are ü — only the length separates feeling from filling.",
  },
  {
    sound: "lang / kurz",
    a: "Hüte",
    aEn: "hats",
    b: "Hütte",
    bEn: "hut",
    tip: "Long ü vs short ü, marked by the double t.",
  },
  // ---------------------------------------------------------------- ch
  {
    sound: "ch",
    a: "nicht",
    aEn: "not",
    b: "Nacht",
    bEn: "night",
    tip: "After i/e/ä it is the soft ich-sound; after a/o/u the hard ach-sound.",
  },
  {
    sound: "ch",
    a: "dich",
    aEn: "you (accusative)",
    b: "Dach",
    bEn: "roof",
    tip: "Soft ch is a hiss at the front, close to an English h in 'hue'.",
  },
  // ---------------------------------------------------------------- sch
  {
    sound: "sch",
    a: "Kirche",
    aEn: "church",
    b: "Kirsche",
    bEn: "cherry",
    tip: "sch is the English 'sh'. The ch in Kirche is much softer.",
  },
  {
    sound: "sch",
    a: "waschen",
    aEn: "to wash",
    b: "wachen",
    bEn: "to be awake",
    tip: "sch is English 'sh'; plain ch after a is the hard ach-sound.",
  },
  // ---------------------------------------------------------------- ß / s
  {
    sound: "ß",
    a: "reisen",
    aEn: "to travel",
    b: "reißen",
    bEn: "to tear",
    tip: "Single s between vowels buzzes like a z. ß never does.",
  },
  {
    sound: "ß",
    a: "weise",
    aEn: "wise",
    b: "weiße",
    bEn: "white",
    tip: "Same rule again — voiced s vs sharp ß.",
  },
  // ---------------------------------------------------------------- z
  {
    sound: "z",
    a: "Zeit",
    aEn: "time",
    b: "seit",
    bEn: "since",
    tip: "German z is 'ts', never an English z. Say it like the ts in cats.",
  },
  {
    sound: "z",
    a: "reizen",
    aEn: "to irritate",
    b: "reisen",
    bEn: "to travel",
    tip: "z is 'ts'; the single s between vowels buzzes like an English z.",
  },
  // ---------------------------------------------------------------- r
  {
    sound: "r",
    a: "Rose",
    aEn: "rose",
    b: "lose",
    bEn: "loose",
    tip: "German r is at the back of the throat, nowhere near the English r.",
  },
  // ---------------------------------------------------------------- ei / ie
  {
    sound: "ei",
    a: "Wein",
    aEn: "wine",
    b: "Wien",
    bEn: "Vienna",
    tip: "ei sounds like English 'eye'. ie sounds like English 'ee'.",
  },
  {
    sound: "ie",
    a: "Bienen",
    aEn: "bees",
    b: "Beinen",
    bEn: "legs (dative)",
    tip: "ie = ee, ei = eye. The order of the letters tells you which.",
  },
  // ---------------------------------------------------------------- eu / äu
  {
    sound: "eu / äu",
    a: "Leute",
    aEn: "people",
    b: "Laute",
    bEn: "sounds",
    tip: "eu is 'oy'. au is 'ow'. They are not close.",
  },
];

/** Pairs for a given sound, or a spread across all sounds if none is asked for. */
/**
 * Below this, a drill is not a drill. Four of the twelve sounds have exactly
 * one pair — and the page opens on whichever sound the learner is weakest at,
 * so landing on "r" used to mean a single pair and nothing else.
 */
const MIN_DRILL = 4;

export function pairsFor(sound: string | null, limit = 8): Pair[] {
  const out = sound ? PAIRS.filter((p) => p.sound === sound).slice(0, limit) : [];

  /*
   * Top up to MIN_DRILL from the other sounds, one each, but only when the
   * chosen sound is too thin to stand alone. A sound with five or six pairs is
   * left exactly as it was: asking for "ü" and being given eight other things
   * is not focus, it is noise.
   */
  if (out.length < MIN_DRILL) {
    const seen = new Set(out.map((p) => p.sound));
    for (const p of PAIRS) {
      if (out.length >= Math.max(MIN_DRILL, sound ? 0 : limit)) break;
      if (seen.has(p.sound)) continue;
      seen.add(p.sound);
      out.push(p);
    }
  }
  return out;
}

export const SOUNDS = [...new Set(PAIRS.map((p) => p.sound))];

/** How a sound is spotted in a word's spelling. */
export const SOUND_SPELLING: Record<string, RegExp> = {
  ü: /ü/,
  ö: /ö/,
  ä: /ä/,
  ch: /ch/,
  sch: /sch/,
  r: /r/,
  z: /z/,
  ß: /ß/,
  ei: /ei/,
  ie: /ie/,
  /*
   * Vowel length, spotted the only way spelling allows: a doubled vowel, or a
   * vowel followed by a silent h. It is a heuristic and it misses plenty —
   * German marks length inconsistently — but the alternative was what stood
   * here before, which was nothing at all, so weakestSound() could never
   * select "lang / kurz" despite it having more pairs (6) than any other sound.
   * The best-stocked drill in the app was unreachable by the thing that picks.
   */
  "lang / kurz": /(aa|ee|oo|[aeiouäöü]h)/,
  "eu / äu": /(eu|äu)/,
};
