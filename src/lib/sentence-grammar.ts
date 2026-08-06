/**
 * What grammar does this sentence actually use?
 *
 * Sentences were filed by level according to how common their WORDS are, which
 * is why "Mein Vater ist der, der Tee trinkt" — a relative clause — turned up on
 * a beginner's second day. Every word in it is common. The structure is not.
 *
 * Pure: no database, no imports, so the rules can be argued with in a test.
 */

/** A structure, and the A1 unit at which it becomes fair game. */
export const TAUGHT_AT: Record<string, number> = {
  praesens: 12,
  negation: 17,
  fragen: 19,
  akkusativ: 21,
  modal: 25,
  trennbar: 27,
  dativ: 29,
  perfekt: 32,
  imperativ: 37,
  wechselpraeposition: 39,
  /* Not taught anywhere in A1. Anything carrying one is out of scope for the
     whole course, which is the honest answer rather than a large number. */
  nebensatz: 99,
  relativsatz: 99,
  konjunktiv: 99,
  passiv: 99,
  praeteritum: 99,
  genitiv: 99,
};

const MODALS =
  /\b(kann|kannst|können|könnt|muss|musst|müssen|müsst|will|willst|wollen|wollt|darf|darfst|dürfen|dürft|soll|sollst|sollen|sollt|möchte|möchtest|möchten|möchtet)\b/;
const SUB =
  /\b(weil|dass|wenn|obwohl|damit|während|bevor|nachdem|falls|ob|sobald|solange)\b/;
const REL = /,\s*(der|die|das|dem|den|denen|deren|dessen|welche[rsnm]?)\b/;
const AUX = /\b(habe|hast|hat|haben|habt|bin|bist|ist|sind|seid)\b/;
const PART = /\b(ge\w{2,}(?:t|en)|worden|gewesen|geworden)\b/;
const KONJ = /\b(wäre|hätte|würde|könnte|müsste|sollte|wären|hätten|würden)\b/;
const PRAET =
  /\b(war|waren|warst|hatte|hatten|hattest|ging|kam|sah|machte|sagte|dachte)\b/;
const PASS = /\b(wird|werden|wurde|wurden)\b[\s\S]*\bge\w{2,}(?:t|en)\b/;
/* Only the articles. A bare -s before a noun was catching "das Buch", because
   "das" ends in s — every neuter sentence in the deck read as genitive. */
const GEN = /\b(des|eines|dessen|deren)\b/;
const IMP =
  /^(bitte\s+)?(komm|geh|nimm|warte|sag|hör|lies|sei|seien|machen sie|warten sie|nehmen sie|kommen sie|sprechen sie|gehen sie)\b/i;
const WECHSEL =
  /\b(in|an|auf|über|unter|vor|hinter|neben|zwischen)\s+(den|dem|die|der|das|einen|einem|eine|einer)\b/;
/*
 * Pronouns, "dem", and the verbs that demand the dative. NOT "den + noun ending
 * in n": that matched "ich sehe den Mann", which is the accusative and the whole
 * point of unit 21. Plural dative is rare enough at A1 to leave out rather than
 * catch by guessing.
 */
const DAT =
  /\b(mir|dir|ihm|uns|euch|ihnen|dem|einem)\b|\b(hilft|helfen|helfe|hilfst|gehört|gehören|gefällt|gefallen|schmeckt|schmecken)\b/;
const AKK = /\b(den|einen|mich|dich|ihn)\b/;
const NEG = /\b(nicht|kein|keine|keinen|keinem|keiner|nichts|nie|niemand)\b/;
const WFRAGE = /^(wer|was|wo|wann|warum|wie|woher|wohin|welche[rsnm]?)\b/i;

/**
 * Phrases learnt whole, before the grammar inside them is taught.
 *
 * "Wie geht es dir?" is unit 4 and contains a dative, which is unit 29. Both are
 * true. Blocking it until 29 would be the rule beating the curriculum, so the
 * curriculum wins: a phrase the course teaches as a unit is reachable when that
 * unit is. Kept short and literal on purpose — this is an exception list, and an
 * exception list that grows is a sign the rules are wrong.
 */
const SET_PHRASES: [RegExp, number][] = [
  [/^wie geht (es|'s) (dir|ihnen|euch)/i, 4],
  /* The pronoun sits between the verb and the adjective — "es geht MIR gut" —
     so a rule expecting them adjacent matches the question and not the answer. */
  [/^es geht (mir|dir|ihm|ihr|uns|euch|ihnen) (gut|schlecht)/i, 4],
  [/^mir geht('s| es)? (gut|schlecht)/i, 4],
  [/^guten (morgen|tag|abend)/i, 1],
  [/^auf wiedersehen/i, 1],
  [/^(vielen dank|danke schön)/i, 1],
  [/^wie heißen sie/i, 4],
  [/^es tut mir leid/i, 4],
  [/^wie spät ist es/i, 10],
];

/** The unit a set phrase belongs to, or 0 when it is not one. */
export function setPhraseUnit(de: string): number {
  const s = de.trim();
  for (const [re, unit] of SET_PHRASES) if (re.test(s)) return unit;
  return 0;
}

/** Every structure the sentence uses. Order does not matter; the caller takes the max. */
export function structuresIn(de: string): string[] {
  const s = de.trim();
  const low = s.toLowerCase();
  const found = new Set<string>();

  if (REL.test(s)) found.add("relativsatz");
  if (SUB.test(low)) found.add("nebensatz");
  if (KONJ.test(low)) found.add("konjunktiv");
  if (PASS.test(low)) found.add("passiv");
  if (GEN.test(s)) found.add("genitiv");
  /* Perfekt before Präteritum: "hat gesagt" contains no Präteritum, but "war"
     inside a Perfekt sentence would otherwise trip it. */
  if (AUX.test(low) && PART.test(low)) found.add("perfekt");
  else if (PRAET.test(low)) found.add("praeteritum");
  if (MODALS.test(low)) found.add("modal");
  if (IMP.test(s) && !WFRAGE.test(s)) found.add("imperativ");
  if (WECHSEL.test(low)) found.add("wechselpraeposition");
  else if (DAT.test(low)) found.add("dativ");
  if (AKK.test(low)) found.add("akkusativ");
  if (NEG.test(low)) found.add("negation");
  if (WFRAGE.test(s) || s.endsWith("?")) found.add("fragen");
  if (!found.size) found.add("praesens");

  return [...found];
}

/**
 * The earliest A1 unit at which every structure in the sentence has been taught.
 * 99 means it is not A1 at all.
 */
export function needsUnit(de: string): number {
  const set = setPhraseUnit(de);
  if (set) return set;
  return structuresIn(de).reduce(
    (max, s) => Math.max(max, TAUGHT_AT[s] ?? 99),
    1,
  );
}

/** Is this sentence fair game for a learner who has finished `unit` of A1? */
export function isReachable(de: string, unit: number): boolean {
  return needsUnit(de) <= unit;
}

/**
 * Where a learner stands, on the 1..40 scale TAUGHT_AT is written in.
 *
 * `unit.ord` restarts at 1 in every level, so an A1.2 learner in unit 3 is at
 * 23 — reading the ord alone would put them back at the alphabet. Past A1 the
 * gate has nothing left to say: every structure on this scale has been taught,
 * and A2 grammar is not on it, so 99 lets everything through rather than
 * pretending to measure something it cannot.
 */
export function reachOf(level: string, ord: number): number {
  if (level === "A1.1") return ord;
  if (level === "A1.2") return 20 + ord;
  return 99;
}
