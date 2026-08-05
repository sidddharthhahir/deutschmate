/**
 * Enrich a plain word list from German Wiktionary. node scripts/import-words.mts
 * data/wordlist-a2.txt A2.1 Input: one lemma per line (blank lines and #comments ignored).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const API = "https://de.wiktionary.org/w/api.php";
const CONTACT =
  process.env.WIKIMEDIA_CONTACT ??
  "https://github.com/local/deutschmate; personal language-learning project";
const UA = {
  "User-Agent": `DeutschMate/0.1 (${CONTACT}) node-fetch`,
  "Api-User-Agent": `DeutschMate/0.1 (${CONTACT})`,
  Accept: "*/*",
};
const BATCH = 40;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const [, , listPath, level = "A2.1"] = process.argv;
if (!listPath || !existsSync(listPath)) {
  console.error("usage: node scripts/import-words.mts <wordlist.txt> [level]");
  console.error("       one lemma per line");
  process.exit(1);
}

const lemmas = readFileSync(listPath, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

console.log(`${lemmas.length} lemmas, level ${level}`);

type Out = {
  id: string;
  lemma: string;
  article?: string;
  plural?: string;
  pos: string;
  en: string;
  topic?: string;
  forms?: Record<string, string>;
};

/** Stable, filename-safe id — must match how audio files are named. */
function slug(lemma: string) {
  return lemma
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const GENUS: Record<string, string> = { m: "der", f: "die", n: "das" };

/** Pull a named parameter out of a wikitext template block. */
function param(block: string, name: string): string | undefined {
  const re = new RegExp(`\\|\\s*${name}\\s*=\\s*([^\\|}\\n]+)`, "i");
  const m = block.match(re);
  const v = m?.[1]?.trim();
  return v && v !== "—" && v !== "-" ? v : undefined;
}

function templateBlock(wikitext: string, name: string): string | undefined {
  const i = wikitext.indexOf(`{{${name}`);
  if (i === -1) return undefined;
  // Templates here are flat enough that the next }} is the end.
  const j = wikitext.indexOf("}}", i);
  return j === -1 ? wikitext.slice(i) : wikitext.slice(i, j);
}

function parse(lemma: string, wikitext: string): Out | null {
  // English gloss: first {{Ü|en|...}} inside the translations section.
  const uebersetzungen = wikitext.split(/==+\s*Übersetzungen/)[1] ?? wikitext;
  const en =
    uebersetzungen.match(/\{\{Ü\|en\|([^}|]+)\}\}/)?.[1]?.trim() ??
    wikitext.match(/\{\{Ü\|en\|([^}|]+)\}\}/)?.[1]?.trim();
  if (!en) return null;

  const noun = templateBlock(wikitext, "Deutsch Substantiv Übersicht");
  if (noun) {
    const g = param(noun, "Genus") ?? param(noun, "Genus 1");
    return {
      id: slug(lemma),
      lemma,
      article: g ? GENUS[g.toLowerCase()] : undefined,
      plural:
        param(noun, "Nominativ Plural") ?? param(noun, "Nominativ Plural 1"),
      pos: "noun",
      en,
    };
  }

  const verb = templateBlock(wikitext, "Deutsch Verb Übersicht");
  if (verb) {
    const forms: Record<string, string> = {};
    const map: [string, string][] = [
      ["ich", "Präsens_ich"],
      ["du", "Präsens_du"],
      ["er", "Präsens_er, sie, es"],
    ];
    for (const [k, p] of map) {
      const v = param(verb, p);
      if (v) forms[k] = v;
    }
    return {
      id: slug(lemma),
      lemma,
      pos: "verb",
      en,
      forms: Object.keys(forms).length ? forms : undefined,
    };
  }

  if (wikitext.includes("Deutsch Adjektiv Übersicht"))
    return { id: slug(lemma), lemma, pos: "adj", en };
  if (wikitext.includes("Deutsch Adverb Übersicht"))
    return { id: slug(lemma), lemma, pos: "adv", en };
  if (/\{\{Wortart\|Präposition\|Deutsch\}\}/.test(wikitext))
    return { id: slug(lemma), lemma, pos: "prep", en };
  if (/\{\{Wortart\|Konjunktion\|Deutsch\}\}/.test(wikitext))
    return { id: slug(lemma), lemma, pos: "conj", en };

  return { id: slug(lemma), lemma, pos: "other", en };
}

async function fetchBatch(titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const url =
    `${API}?action=query&format=json&formatversion=2&prop=revisions&rvprop=content&rvslots=main&titles=` +
    encodeURIComponent(titles.join("|"));

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: UA });
    const text = await res.text();
    if (!res.ok || !text.trimStart().startsWith("{")) {
      console.warn(`  ! HTTP ${res.status}, retrying`);
      await sleep(1500 * (attempt + 1));
      continue;
    }
    const data = JSON.parse(text) as {
      query?: {
        pages?: {
          title: string;
          missing?: boolean;
          revisions?: { slots: { main: { content: string } } }[];
        }[];
      };
    };
    for (const p of data.query?.pages ?? []) {
      const content = p.revisions?.[0]?.slots?.main?.content;
      if (content) out.set(p.title, content);
    }
    return out;
  }
  return out;
}

const results: Out[] = [];
const failed: string[] = [];

for (let i = 0; i < lemmas.length; i += BATCH) {
  const chunk = lemmas.slice(i, i + BATCH);
  const pages = await fetchBatch(chunk);
  for (const lemma of chunk) {
    const wikitext = pages.get(lemma);
    if (!wikitext) {
      failed.push(lemma);
      process.stdout.write("·");
      continue;
    }
    const parsed = parse(lemma, wikitext);
    if (parsed) {
      results.push(parsed);
      process.stdout.write("▪");
    } else {
      failed.push(lemma);
      process.stdout.write("?");
    }
  }
  await sleep(400);
}

const outPath = path.join(
  ROOT,
  "data",
  `words-${level.toLowerCase().replace(".", "-")}.json`,
);
writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");

console.log(
  `\n\n✓ ${results.length}/${lemmas.length} enriched -> ${path.relative(ROOT, outPath)}`,
);
const nouns = results.filter((r) => r.pos === "noun");
const withArticle = nouns.filter((r) => r.article).length;
console.log(`  nouns: ${nouns.length} (${withArticle} with article)`);
console.log(`  verbs: ${results.filter((r) => r.pos === "verb").length}`);

if (failed.length) {
  const failPath = path.join(
    ROOT,
    "data",
    `failed-${level.toLowerCase().replace(".", "-")}.txt`,
  );
  writeFileSync(failPath, failed.join("\n") + "\n");
  console.log(
    `  ${failed.length} need manual entry -> ${path.relative(ROOT, failPath)}`,
  );
}
console.log(
  `\nReview the JSON, then add it to scripts/seed.mts and run: npm run seed`,
);
