/**
 * What each error tag is called — once, in both languages.
 *
 * THERE WERE THREE COPIES. errors.ts held English descriptions; SessionRecap
 * and ClozeBlock each held their own German map, because errors.ts imports the
 * database and a client component cannot. They had drifted in every way a
 * duplicate can:
 *
 *   article-gender    "Wrong article (der/die/das)" · "der / die / das" · "Artikel"
 *   verb-position-2   "Verb not in second position" · "Verb an Position 2" · "Verbstellung"
 *
 * So the same mistake was called Wortwahl on the recap and "Wrong word chosen"
 * on Fortschritt one click later, and neither German copy knew about the four
 * tags added with the prebuilt explanations — those rendered as raw keys like
 * `perfekt-hilfsverb`.
 *
 * This file imports nothing, so every one of them can use it.
 *
 * TWO MAPS ON PURPOSE, not a translation of one another:
 *
 *   DE  the interface. Short, the way a teacher names it out loud.
 *   EN  the explanation, and the text handed to a model. Fuller, because it
 *       has to stand alone in a prompt with no screen around it.
 *
 * The app's rule is German interface, English explanations (spec §1). A tag in
 * a list of "Häufigste Fehler" is interface; the same tag inside a "Warum?"
 * paragraph is explanation.
 */

export const TAG_EN = {
  "article-gender": "Wrong article (der/die/das)",
  "article-akkusativ": "Nominative article where accusative is needed",
  "article-dativ": "Dative needed (mit, nach, bei, seit, von, zu, aus)",
  "article-genitiv": "Genitive needed",
  "verb-ending": "Wrong verb ending for the subject",
  "verb-position-2": "Verb not in second position",
  "verb-final": "Infinitive not at the end after a modal",
  "perfekt-hilfsverb": "haben or sein in the perfect",
  praeposition: "Wrong preposition",
  plural: "Wrong plural form",
  negation: "nicht vs kein",
  pronoun: "Wrong pronoun (du / Sie / ihr)",
  capitalisation: "Nouns are capitalised in German",
  spelling: "Spelling — often umlaut or ß",
  "word-order": "Word order",
  vocabulary: "Wrong word chosen",
} as const;

export type Tag = keyof typeof TAG_EN;

export const TAG_DE: Record<Tag, string> = {
  "article-gender": "der / die / das",
  "article-akkusativ": "Akkusativ",
  "article-dativ": "Dativ",
  "article-genitiv": "Genitiv",
  "verb-ending": "Verbendung",
  "verb-position-2": "Verb an Position 2",
  "verb-final": "Infinitiv am Ende",
  "perfekt-hilfsverb": "haben oder sein",
  praeposition: "Präposition",
  plural: "Plural",
  negation: "nicht / kein",
  pronoun: "du / Sie / ihr",
  capitalisation: "Großschreibung",
  spelling: "Rechtschreibung",
  "word-order": "Wortstellung",
  vocabulary: "Wortwahl",
};

/** The German label, falling back to the raw key rather than to nothing. */
export const de = (tag: string): string => TAG_DE[tag as Tag] ?? tag;

/** The English description, for explanations and prompts. */
export const en = (tag: string): string => TAG_EN[tag as Tag] ?? tag;
