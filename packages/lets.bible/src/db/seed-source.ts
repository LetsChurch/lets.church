// Seeds bible_source_token — the original-language (Greek/Hebrew) words in
// ORIGINAL word order, the basis for a true morphological interlinear. Sources:
//   • Greek NT  — STEPBible TAGNT (Translators Amalgamated Greek NT)
//   • Hebrew OT — STEPBible TAHOT (Translators Amalgamated Hebrew OT)
// Both CC BY 4.0, whose English gloss is itself BSB-based so it aligns with our
// text. Fetched at seed time (not committed), mirroring the BSB USX seed.
//
// Run: `just lb-seed-source` (defaults to John for BSB). Override with
//   BOOKS=NT|OT|ALL|JHN,GEN,…  TRANSLATION_ID=BSB|MSB|WEB|KJV
// Textual basis per translation (NT): BSB → critical (NA27/28), MSB/WEB →
// Byzantine (Majority text), KJV → Textus Receptus (Scrivener 1894) — the Greek
// the KJV was actually translated from, so its interlinear reflects the KJV's
// own text (incl. TR-only readings like the Comma Johanneum, which the critical
// text omits). Hebrew OT is the Masoretic (Leningrad)
// base for every translation — seed it once (under BSB); the API falls back to
// the default translation for the OT.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { and, eq, inArray } from 'drizzle-orm';
import { findBook, NEW_TESTAMENT, OLD_TESTAMENT } from '../lib/canon';
import { bibleSourceToken, db } from '.';

const TRANSLATION_ID = process.env.TRANSLATION_ID ?? 'BSB';

const NT = NEW_TESTAMENT.map((b) => b.code);
const OT = OLD_TESTAMENT.map((b) => b.code);

function expandBooks(spec: string): string[] {
  const s = spec.trim().toUpperCase();
  if (s === 'NT') return NT;
  if (s === 'OT') return OT;
  if (s === 'ALL') return [...OT, ...NT];
  return s
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}
const BOOKS = expandBooks(process.env.BOOKS ?? 'JHN');

// Which Greek edition counts as a translation's textual basis (NT only). BSB
// follows the critical text (Nestlé-Aland); MSB and WEB the Byzantine/Majority
// text (the WEB NT is translated from the Greek Majority Text); KJV the Textus
// Receptus (Scrivener 1894). STEPBible's editions column (col 6) tags each word
// with the editions that contain it, e.g. `NA28+NA27+…+TR+Byz`; we keep only the
// words present in this translation's edition.
const GREEK_BASIS =
  TRANSLATION_ID === 'KJV'
    ? 'TR'
    : TRANSLATION_ID === 'MSB' || TRANSLATION_ID === 'WEB'
      ? 'Byz'
      : 'NA2';

// The STEPBible source files and which books each covers. The book lists are
// sliced from the canon (so the USFM codes are authoritative), matching each
// file's canonical range.
type Lang = 'greek' | 'hebrew';
type SourceFile = { name: string; language: Lang; books: string[] };
const FILES: SourceFile[] = [
  { name: 'TAGNT Mat-Jhn', language: 'greek', books: NT.slice(0, 4) },
  { name: 'TAGNT Act-Rev', language: 'greek', books: NT.slice(4) },
  { name: 'TAHOT Gen-Deu', language: 'hebrew', books: OT.slice(0, 5) },
  { name: 'TAHOT Jos-Est', language: 'hebrew', books: OT.slice(5, 17) },
  { name: 'TAHOT Job-Sng', language: 'hebrew', books: OT.slice(17, 22) },
  { name: 'TAHOT Isa-Mal', language: 'hebrew', books: OT.slice(22) },
];

// The STEPBible files are committed (gzip-compressed) under seed/stepbible/ —
// CC BY 4.0, see seed/stepbible/ATTRIBUTION.md — so seeding has no network
// dependency. The slug matches the gzip filename derived from each file's name
// ("TAGNT Mat-Jhn" → "tagnt-mat-jhn.txt.gz").
const STEPBIBLE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'seed',
  'stepbible',
);

function loadFile(f: SourceFile): string {
  const path = join(
    STEPBIBLE_DIR,
    `${f.name.toLowerCase().replace(/\s+/g, '-')}.txt.gz`,
  );
  return gunzipSync(readFileSync(path)).toString('utf8');
}

// Disambiguated dStrongs ("G0025=…", "H1732|G1138«G1138", "{H7225G}") → a plain
// normalized Strong's ("G25", "H7225") that joins to bible_lexeme: take the last
// G/H number (skipping STEPBible's H9xxx prefix/punctuation meta-strongs where a
// real one exists) and strip leading zeros.
function normStrong(field: string): string | null {
  const nums = field.match(/[GH]\d+/g);
  if (!nums) {
    return null;
  }
  const content = nums.filter((n) => !/^H9\d{3}$/.test(n));
  const pick = (content.length ? content : nums).at(-1) as string;
  return pick.replace(/^([GH])0+(\d)/, '$1$2');
}

type Parsed = {
  usfm: string;
  chapter: number;
  verse: number;
  origPos: number;
  surface: string;
  transliteration: string | null;
  strong: string | null;
  lemma: string | null;
  gloss: string | null;
  english: string | null;
  morph: string | null;
  language: Lang;
};

const REF_RE = /^([1-9A-Za-z]+)\.(\d+)\.(\d+)#(\d+)=(\S+)$/;

// "ἠγάπησεν (ēgapēsen)" → surface + transliteration
function splitGreek(field: string): {
  surface: string;
  translit: string | null;
} {
  const m = field.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return m
    ? { surface: m[1].trim(), translit: m[2].trim() || null }
    : { surface: field.trim(), translit: null };
}

// A TAGNT (Greek) data row → Parsed, or null to skip. Columns: [0] ref, [1] Greek
// (incl. translit), [2] English, [3] dStrong=Grammar, [4] lemma=Gloss, [5] editions.
function parseGreekRow(cols: string[], usfm: string): Parsed | null {
  const ref = REF_RE.exec((cols[0] ?? '').trim());
  if (!ref) {
    return null;
  }
  if (!(cols[5] ?? '').includes(GREEK_BASIS)) {
    return null; // not in this translation's textual basis
  }
  const { surface, translit } = splitGreek(cols[1] ?? '');
  if (!surface) {
    return null;
  }
  const grammar = cols[3] ?? '';
  const lemmaGloss = cols[4] ?? '';
  const eq = lemmaGloss.indexOf('=');
  return {
    usfm,
    chapter: Number(ref[2]),
    verse: Number(ref[3]),
    origPos: Number(ref[4]),
    surface,
    transliteration: translit,
    strong: normStrong(grammar.split('=')[0] ?? ''),
    lemma: eq >= 0 ? lemmaGloss.slice(0, eq).trim() || null : null,
    gloss: eq >= 0 ? lemmaGloss.slice(eq + 1).trim() || null : null,
    english: (cols[2] ?? '').trim() || null,
    morph: grammar.includes('=') ? grammar.split('=')[1].trim() || null : null,
    language: 'greek',
  };
}

// A TAHOT (Hebrew) data row → Parsed, or null to skip. Hebrew words are compound
// (morphemes joined by "/"); we keep one token per slot — the whole pointed word,
// the ROOT Strong's, and the main morpheme's parsing. Columns: [0] ref(=L base),
// [1] Hebrew, [2] translit, [3] English, [4] dStrong, [5] Grammar, [8] Root
// dStrong, [11] Expanded tags (lemma).
function parseHebrewRow(cols: string[], usfm: string): Parsed | null {
  const ref = REF_RE.exec((cols[0] ?? '').trim());
  if (!ref) {
    return null;
  }
  // Base Masoretic text only: "L" (Leningrad). Skip Qere ("Q…") and insertions.
  if (!ref[5].startsWith('L')) {
    return null;
  }
  // Surface: drop trailing punctuation (after "\") and the morpheme separators.
  const surface = (cols[1] ?? '').split('\\')[0].replace(/\//g, '').trim();
  if (!surface) {
    return null;
  }
  const translit = (cols[2] ?? '').replace(/\//g, '').trim() || null;
  const english = (cols[3] ?? '')
    .replace(/\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Main morpheme's grammar: drop the leading language tag (H/A) and take the
  // last "/"-segment (the content word; prefixes lead).
  const grammarSegs = (cols[5] ?? '').replace(/^[HA]/, '').split('/');
  const morph = grammarSegs.at(-1)?.trim() || null;
  // Lemma from the braced main entry of the expanded tags, e.g. "{H7225G=רֵאשִׁית=…}".
  const lemma =
    (cols[11] ?? '').match(/\{[^=}]+=([^=}]+)=/)?.[1]?.trim() || null;
  // Root Strong's (col 8) is the content word; fall back to col 4.
  const strong = normStrong(cols[8] ?? '') ?? normStrong(cols[4] ?? '');
  return {
    usfm,
    chapter: Number(ref[2]),
    verse: Number(ref[3]),
    origPos: Number(ref[4]),
    surface,
    transliteration: translit,
    strong,
    lemma,
    gloss: null,
    english: english || null,
    morph,
    language: 'hebrew',
  };
}

function parseFile(
  text: string,
  language: Lang,
  wantBooks: Set<string>,
): Parsed[] {
  const out: Parsed[] = [];
  for (const line of text.split('\n')) {
    const cols = line.split('\t');
    const first = (cols[0] ?? '').trim();
    const m = REF_RE.exec(first);
    if (!m) {
      continue;
    }
    const usfm = findBook(m[1])?.code;
    if (!usfm || !wantBooks.has(usfm)) {
      continue;
    }
    const row =
      language === 'greek'
        ? parseGreekRow(cols, usfm)
        : parseHebrewRow(cols, usfm);
    if (row) {
      out.push(row);
    }
  }
  return out;
}

async function insertChunked(
  rows: Array<typeof bibleSourceToken.$inferInsert>,
) {
  for (let i = 0; i < rows.length; i += 1000) {
    await db.insert(bibleSourceToken).values(rows.slice(i, i + 1000));
  }
}

async function main() {
  const wantBooks = new Set(BOOKS);
  const files = FILES.filter((f) => f.books.some((b) => wantBooks.has(b)));
  if (files.length === 0) {
    throw new Error(`No source file covers books: ${BOOKS.join(', ')}`);
  }

  const parsed: Parsed[] = [];
  for (const f of files) {
    console.log(`Reading ${f.name}…`);
    parsed.push(...parseFile(loadFile(f), f.language, wantBooks));
  }

  // Group by verse, order by the original #NN, dedupe slots, reindex 0-based so
  // each verse's words are a clean 0..N-1 run in original-language order.
  const byVerse = new Map<string, Parsed[]>();
  for (const p of parsed) {
    const key = `${p.usfm}.${p.chapter}.${p.verse}`;
    const list = byVerse.get(key);
    if (list) {
      list.push(p);
    } else {
      byVerse.set(key, [p]);
    }
  }
  const rows: Array<typeof bibleSourceToken.$inferInsert> = [];
  for (const words of byVerse.values()) {
    words.sort((a, b) => a.origPos - b.origPos);
    let position = 0;
    let lastOrig = -1;
    for (const w of words) {
      if (w.origPos === lastOrig) {
        continue; // dedupe variant rows sharing a slot
      }
      lastOrig = w.origPos;
      rows.push({
        translationId: TRANSLATION_ID,
        book: w.usfm,
        chapter: w.chapter,
        verse: w.verse,
        position: position++,
        surface: w.surface,
        transliteration: w.transliteration,
        strong: w.strong,
        lemma: w.lemma,
        gloss: w.gloss,
        english: w.english,
        morph: w.morph,
        language: w.language,
      });
    }
  }

  await db
    .delete(bibleSourceToken)
    .where(
      and(
        eq(bibleSourceToken.translationId, TRANSLATION_ID),
        inArray(bibleSourceToken.book, BOOKS),
      ),
    );
  await insertChunked(rows);

  console.log(
    `Seeded ${rows.length} ${TRANSLATION_ID} source words across ${byVerse.size} verses (${BOOKS.length} book(s)).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
