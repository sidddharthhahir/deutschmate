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
