// Parser for the e-Sword "KJV+" module (1769 King James Version with Strong's
// numbers + Tense/Voice/Mood), distributed as a single JSON file of 31,102
// verses. Produces the same reading layers as the USX parser (server/usx) so the
// KJV plugs into the existing reader/interlinear without renderer changes:
//   1. reading blocks (components/passage/types.ts) — prose, verse-addressed
//   2. word tokens — every English word, with its Strong's number + morphology,
//      addressed book.chapter.verse.position for interlinear + word study
//
// Source shape (one row per verse):
//   { "book_name": "Genesis", "book": 1, "chapter": 1, "verse": 1,
//     "text": "In the beginning{H7225} God{H430} created{H1254}{(H8804)}..." }
//
// Inline markup: a word is followed by its tag cluster — `{H7225}`/`{G25}` is the
// Strong's number (attaches to the immediately preceding word), `{(H8804)}`/
// `{(G5656)}` is the morphology/TVM code, and extra `{H853}`-style tags are the
// untranslated particles Strong's still numbers (kept as the word's primary code
// only when it has none of its own). Function words (no tag) become null-Strong's
// tokens so positions stay aligned 1:1 with the reading runs.
//
// Unlike the BSB/MSB enhanced USX, this source carries no paragraphing, poetry,
// headings, cross-references, or source-text-overlay markup. We therefore render
// each chapter as a single prose block. Only red-letter (wordsOfJesus) is baked
// here, *projected* from a reference translation (see ../overlays); the divine
// name / OT quotation / divine-name notes are applied at render time from the
// translation-independent index (lib/apply-overlays.ts), not baked.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Block, ProseVerse, Run } from '../../components/passage/types';
import { CANON, type CanonBook } from '../../lib/canon';
import {
  applyManualRedLetter,
  type OverlayReference,
  projectOverlays,
  type RefToken,
} from '../overlays';
import type { ParsedChapter } from '../usx/parse';

export type SourceVerse = {
  book_name: string;
  book: number; // 1..66, matches CANON ordinal
  chapter: number;
  verse: number;
  text: string;
};

export type KjvToken = {
  chapter: number;
  verse: number;
  position: number; // 0-based word index within the verse
  surface: string;
  strong?: string;
  morph?: string;
  // Source-text overlays, projected from a reference translation (see ../overlays).
  wordsOfJesus?: boolean;
  otQuote?: boolean;
  divineName?: boolean;
};

export type KjvParsedBook = {
  book: CanonBook;
  chapters: Record<string, ParsedChapter>;
  tokens: KjvToken[];
};

// Match a KJV word: letters, with internal apostrophes/hyphens (e.g. "Beer-sheba",
// "Maher-shalal-hash-baz"). Everything between words is a separator run.
const WORD = /[A-Za-z]+(?:[’'-][A-Za-z]+)*/g;
const TAG = /\{([^}]*)\}/g;

// Strip a tag's leading zeros so the Strong's number matches bible_lexeme /
// STEPBible dStrong (which are stored unpadded, e.g. "G25", "H3068"). The source
// is already unpadded, but normalize defensively for a clean lexicon join.
function normStrong(raw: string): string {
  return raw.replace(/^([GH])0+(\d)/, '$1$2');
}

type Unit =
  | { word: true; text: string; strong?: string; morph?: string }
  | {
      word: false;
      text: string;
    };

// Split one verse's source text into ordered word/separator units, attaching each
// tag cluster to the word it follows.
function splitUnits(text: string): Unit[] {
  const units: Unit[] = [];
  let lastWord = -1; // index in `units` of the most recent word

  const flush = (buf: string) => {
    let i = 0;
    for (const m of buf.matchAll(WORD)) {
      if (m.index > i) {
        units.push({ word: false, text: buf.slice(i, m.index) });
      }
      units.push({ word: true, text: m[0] });
      lastWord = units.length - 1;
      i = m.index + m[0].length;
    }
    if (i < buf.length) {
      units.push({ word: false, text: buf.slice(i) });
    }
  };

  let cursor = 0;
  let buf = '';
  TAG.lastIndex = 0;
  for (const m of text.matchAll(TAG)) {
    buf += text.slice(cursor, m.index);
    flush(buf);
    buf = '';
    cursor = m.index + m[0].length;
    if (lastWord < 0) {
      continue; // a tag with no preceding word — nothing to attach to
    }
    const inner = m[1];
    const w = units[lastWord] as Extract<Unit, { word: true }>;
    if (inner.startsWith('(')) {
      const code = inner.replace(/[()]/g, '').trim();
      w.morph = w.morph ? `${w.morph} ${code}` : code;
    } else if (!w.strong) {
      w.strong = normStrong(inner);
    }
  }
  buf += text.slice(cursor);
  flush(buf);
  return units;
}

// Build the reading runs + word tokens + clean plain text for one verse. When
// `ref` is set, red-letter (words of Jesus) is projected from the reference
// translation (`refTokens`) and baked in here. The other source-text overlays
// (divine name / OT quotation / divine-name notes) are NOT baked — they're applied
// at render time from the translation-independent index (see lib/apply-overlays.ts).
function parseVerse(
  chapter: number,
  verse: number,
  text: string,
  ref?: string, // canonical ref; presence means red-letter projection is active
  refTokens?: RefToken[],
): { runs: Run[]; tokens: KjvToken[]; plain: string } {
  const units = splitUnits(text);
  const runs: Run[] = [];
  const tokens: KjvToken[] = [];
  const wordRuns: Run[] = []; // word runs by 0-based position
  let position = 0;
  for (const u of units) {
    if (u.word) {
      const run: Run = { text: u.text, position };
      if (u.strong) {
        run.strong = u.strong;
      }
      runs.push(run);
      wordRuns.push(run);
      tokens.push({
        chapter,
        verse,
        position,
        surface: u.text,
        ...(u.strong ? { strong: u.strong } : {}),
        ...(u.morph ? { morph: u.morph } : {}),
      });
      position += 1;
    } else {
      runs.push({ text: u.text });
    }
  }
  const plain = units
    .map((u) => u.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

  if (ref !== undefined) {
    // Red-letter: projected from the reference translation (the overlay tool does
    // not carry words of Jesus) and baked in. Divine name / OT quotation / notes
    // are applied at render time from the index, not here.
    const { red } = projectOverlays(refTokens, tokens);
    applyManualRedLetter(ref, tokens, red); // curated pure-TR clauses (Acts 9:5)
    for (let i = 0; i < red.length; i++) {
      if (red[i]) {
        tokens[i].wordsOfJesus = true;
        wordRuns[i].redletter = true;
      }
    }

    // Make red-letter continuous: a separator run (the space/punctuation between
    // two red-letter words) inherits the flag, so the colored text isn't broken at
    // every space. Mirrors the USX parser, where text *inside* a `wj` span carries
    // the flag. Only bridges gaps strictly between two word runs (never across a
    // footnote or the verse edge).
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      if (run.position !== undefined || run.note) {
        continue; // a word run or footnote, not an interior gap
      }
      let p = i - 1;
      while (p >= 0 && runs[p].position === undefined && !runs[p].note) p -= 1;
      let n = i + 1;
      while (
        n < runs.length &&
        runs[n].position === undefined &&
        !runs[n].note
      ) {
        n += 1;
      }
      const prev = p >= 0 ? runs[p] : undefined;
      const next = n < runs.length ? runs[n] : undefined;
      if (prev?.position === undefined || next?.position === undefined) {
        continue;
      }
      if (prev.redletter && next.redletter) {
        run.redletter = true;
      }
    }
  }
  return { runs, tokens, plain };
}

// The committed source: the e-Sword "KJV+" verse list. Read by both the DB seed
// (seed-kjv.ts) and the static reading/search asset build (build-flex-index.ts)
// so the two paths always agree. Override with the KJV_SOURCE env var (path).
export const KJV_SOURCE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'seed',
  'kjv',
  'kjv_strongs.json',
);

export function loadKjvSource(path: string = KJV_SOURCE_PATH): SourceVerse[] {
  const json = JSON.parse(readFileSync(path, 'utf8')) as {
    verses?: SourceVerse[];
  };
  if (!Array.isArray(json.verses) || json.verses.length === 0) {
    throw new Error(`KJV source at ${path} had no \`verses\` array`);
  }
  return json.verses;
}

const byOrdinal = new Map(CANON.map((b) => [b.ordinal, b]));

// Parse the whole KJV+ verse list into one ParsedBook per canon book, in
// canonical order. Verses are grouped and numerically sorted defensively. When an
// `overlays` reference is supplied, the source-text overlays (words of Jesus, OT
// quotations, divine name) are projected onto each verse (see ../overlays).
export function parseKjvStrongs(
  verses: SourceVerse[],
  overlays?: OverlayReference,
): KjvParsedBook[] {
  // book ordinal -> chapter -> verse -> source text
  const grouped = new Map<number, Map<number, Map<number, string>>>();
  for (const v of verses) {
    let chapters = grouped.get(v.book);
    if (!chapters) {
      chapters = new Map();
      grouped.set(v.book, chapters);
    }
    let vs = chapters.get(v.chapter);
    if (!vs) {
      vs = new Map();
      chapters.set(v.chapter, vs);
    }
    vs.set(v.verse, v.text);
  }

  const out: KjvParsedBook[] = [];
  for (const ordinal of [...grouped.keys()].sort((a, b) => a - b)) {
    const book = byOrdinal.get(ordinal);
    if (!book) {
      throw new Error(`Unknown KJV book ordinal ${ordinal}`);
    }
    const srcChapters = grouped.get(ordinal) as Map<
      number,
      Map<number, string>
    >;
    const chapters: Record<string, ParsedChapter> = {};
    const tokens: KjvToken[] = [];

    for (const ch of [...srcChapters.keys()].sort((a, b) => a - b)) {
      const srcVerses = srcChapters.get(ch) as Map<number, string>;
      const proseVerses: ProseVerse[] = [];
      const verseText: Record<string, string> = {};
      for (const v of [...srcVerses.keys()].sort((a, b) => a - b)) {
        const ref = `${book.code}.${ch}.${v}`;
        const {
          runs,
          tokens: vtoks,
          plain,
        } = parseVerse(
          ch,
          v,
          srcVerses.get(v) as string,
          overlays ? ref : undefined,
          overlays?.get(ref),
        );
        proseVerses.push({ num: v, verse: v, runs });
        verseText[String(v)] = plain;
        tokens.push(...vtoks);
      }
      const blocks: Block[] = proseVerses.length
        ? [{ kind: 'prose', verses: proseVerses }]
        : [];
      chapters[String(ch)] = { number: ch, blocks, verses: verseText };
    }

    out.push({ book, chapters, tokens });
  }
  return out;
}
