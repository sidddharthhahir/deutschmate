/** What each error tag is called — once, in both languages. */

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

/**
 * `attempt.kind` → German display name, for headers and history lists. One map for both, since
 * `fehler/[tag]` used to carry a subset of this same table under its own name and the two had
 * already started drifting.
 */
export const KIND_LABEL: Record<string, string> = {
  review: "Wiederholung",
  builder: "Sätze bauen",
  listening: "Hören",
  reading: "Lesen",
  speaking: "Sprechen",
  writing: "Schreiben",
  quiz: "Quiz",
  fix: "Fix",
  "new-vocab": "Neue Wörter",
  "new-grammar": "Grammatik",
  conversation: "Gespräch",
  cloze: "Lücken",
  "grammar-review": "Grammatik-Wdh.",
  "exam-lesen": "Test · Lesen",
  "exam-hoeren": "Test · Hören",
  "exam-wortschatz": "Test · Wortschatz",
  "exam-grammatik": "Test · Grammatik",
};

/**
 * Same idea, worded for "you met this word by X-ing" sentences on /wort — a participle/verb
 * phrasing, not the noun-phrase headers of `KIND_LABEL`, so kept as its own map rather than
 * forced to share text that would read wrong in one of the two places.
 */
export const MET_KIND_LABEL: Record<string, string> = {
  "new-vocab": "eingeführt",
  review: "Wiederholung",
  fix: "Fehlerrunde",
  cloze: "Lücke",
  listening: "Hören",
  reading: "Lesen",
  builder: "Satzbau",
  speaking: "Sprechen",
  writing: "Schreiben",
  conversation: "Gespräch",
  quiz: "Quiz",
  video: "Video",
};
