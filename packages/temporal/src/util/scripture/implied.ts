// Layer 2: chapter/verse mentions whose book is implied by context — "in
// verse 17", "look back at verses 18 and 19", "chapter 4, verses 1 through
// 13" — resolved against the passage the speaker is working through.
//
// Context comes from two places: the passage cited most recently (explicit
// citations and "chapter N" mentions as the transcript goes) and the
// sermon's primary passage, parsed from its title/description. Expository
// sermons leave the main text for asides ("as Romans 3:23 says…") and come
// back with a bare "verse 19", so a recent citation only wins while it is
// recent; after that the primary passage takes over again.

import { bcv_parser } from 'bible-passage-reference-parser/esm/bcv_parser.js';
import * as en from 'bible-passage-reference-parser/esm/lang/en.js';

import { isOsisBook, type OsisBook } from './books';
import {
  CHAPTER_WORDS,
  readChapterVerse,
  readRangeEnd,
  VERSE_WORDS,
  type FoundRef,
} from './explicit';
import { parseNumber, type Token } from './tokens';
import { validateBibleRef, verseCount, type BibleRef } from './versification';

// A bare verse this soon after a citation continues it, even when the
// sermon's own passage also has that verse ("Romans 3:23 says it, and verse
// 24…").
const IMMEDIATE_WORDS = 60;
// ~2 minutes of speech: within this, a recent citation still beats the
// primary passage unless the number fits the primary passage.
const RECENT_WORDS = 300;
// ~25 minutes: beyond this, with no primary passage, context is stale.
const STALE_WORDS = 4000;

// "verse 3 of the hymn" — verses of songs, not Scripture.
const SONG_WORDS: ReadonlySet<string> = new Set([
  'hymn',
  'hymns',
  'song',
  'songs',
  'stanza',
  'poem',
  'hymnal',
  'sing',
  'sang',
  'singing',
  'chorus',
]);

type Context = { book: OsisBook; chapter: number; pos: number };

let parser: bcv_parser | undefined;
function titleParser(): bcv_parser {
  if (!parser) {
    parser = new bcv_parser(en);
    parser.set_options({
      osis_compaction_strategy: 'bc',
      sequence_combination_strategy: 'separate',
      case_sensitive: 'books',
      single_chapter_1_strategy: 'verse',
    });
  }
  return parser;
}

/**
 * The passage a sermon is about, from its title or description ("Honoring
 * the Dishonorable - 1 Peter 2:18-25", "Text: 1 John 5:3"). Written text, so
 * a general reference parser is reliable here.
 */
export function primaryPassage(
  ...texts: Array<string | null | undefined>
): BibleRef | null {
  for (const text of texts) {
    if (!text) continue;
    // "Psa. 44, vv. 9-16" — the parser reads "vv." as a new sequence.
    const written = text.replace(/(\d+),?\s+vv?\.\s*(?=\d)/g, '$1:');
    // Title separators: "Book of Psalms - Psa. 44:9-16" isn't a range from
    // Psalms to Psalm 44.
    for (const part of written.split(/\s[-–—|]\s/)) {
      for (const { osis } of titleParser().parse(part).osis_and_indices()) {
        const ref = parseOsis(osis);
        if (ref?.chapter !== undefined) return ref;
      }
    }
  }
  return null;
}

/** "Ps.44.9-Ps.44.16" / "Rom.12" / "Heb.1.4-Heb.2.18" → BibleRef. */
export function parseOsis(osis: string): BibleRef | null {
  const [start, end] = osis.split(',')[0]?.split('-') ?? [];
  const [book, chapter, verse] = start?.split('.') ?? [];
  if (!book || !isOsisBook(book)) return null;
  const ref: Record<string, unknown> = { book, chapter, verse };
  if (end) {
    const [endBook, endChapter, endVerse] = end.split('.');
    if (endBook !== book) return validateBibleRef(ref);
    ref.endChapter = endChapter;
    ref.endVerse = endVerse;
  }
  return validateBibleRef(ref);
}

export type ParagraphTokens = {
  tokens: readonly Token[];
  // Explicit citations in this paragraph, left to right.
  explicit: readonly FoundRef[];
};

/** Book-implied chapter/verse mentions, per paragraph. */
export function findImpliedRefs(
  paragraphs: readonly ParagraphTokens[],
  primary: BibleRef | null,
): FoundRef[][] {
  const primaryContext =
    primary?.chapter !== undefined
      ? { book: primary.book, chapter: primary.chapter, passage: primary }
      : null;
  let recent: Context | null = null;
  let offset = 0;
  const out: FoundRef[][] = [];

  const contexts = (pos: number): Contexts => {
    const age = recent ? pos - recent.pos : Number.POSITIVE_INFINITY;
    const fresh = age <= RECENT_WORDS ? recent : null;
    const live = age <= STALE_WORDS ? recent : null;
    const ordered = fresh
      ? [fresh, primaryContext]
      : primaryContext
        ? [primaryContext, live]
        : [live];
    return {
      candidates: ordered.filter((c): c is NonNullable<typeof c> => c !== null),
      immediate: age <= IMMEDIATE_WORDS,
    };
  };

  for (const { tokens, explicit } of paragraphs) {
    const found: FoundRef[] = [];
    let next = 0;
    let i = 0;
    while (i < tokens.length) {
      const citation = explicit[next];
      if (citation && i >= citation.start) {
        if (citation.ref.chapter !== undefined) {
          recent = {
            book: citation.ref.book,
            chapter: citation.ref.chapter,
            pos: offset + citation.start,
          };
        }
        next += 1;
        i = Math.max(i, citation.end);
        continue;
      }
      const stop = citation ? citation.start : tokens.length;
      const hit = readImplied(tokens, i, stop, contexts(offset + i));
      if (hit) {
        found.push(hit.found);
        if (hit.setsChapter) {
          recent = {
            book: hit.found.ref.book,
            chapter: hit.found.ref.chapter as number,
            pos: offset + i,
          };
        }
        i = hit.found.end;
      } else {
        i += 1;
      }
    }
    out.push(found);
    offset += tokens.length;
  }
  return out;
}

/** Chapter:verse written without a book or keyword: "10:19", "10 .19".
 * (Not "3, 16": a comma after a bare number is too often just a list.) */
function isBareChapterVerse(tokens: readonly Token[], i: number): boolean {
  const token = tokens[i];
  if (!token) return false;
  const colon = /^\d{1,3}:\d{1,3}/.test(token.clean);
  const next = tokens[i + 1];
  const dotted =
    /^\d{1,3}$/.test(token.clean) &&
    token.trail === '' &&
    next?.lead === '.' &&
    /^\d{1,3}$/.test(next.clean);
  if (!colon && !dotted) return false;
  // "service at 10:30 on Sunday" is a time, not a verse.
  const prev = tokens[i - 1]?.clean ?? '';
  const after = tokens[i + (colon ? 1 : 2)]?.clean ?? '';
  // "Sunday 10:30", "our 10:45 and 11:15 services", "the 9:30 service".
  if (TIME_BEFORE.has(prev) || TIME_AFTER.has(after) || DAYS.has(prev)) {
    return false;
  }
  return !tokens
    .slice(i + 1, i + 6)
    .some((t) => t.clean === 'service' || t.clean === 'services');
}

const DAYS: ReadonlySet<string> = new Set([
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'our',
]);
const TIME_BEFORE: ReadonlySet<string> = new Set([
  'at',
  'by',
  'around',
  'about',
  'until',
  'till',
  'from',
  'since',
  'before',
  'after',
]);
const TIME_AFTER: ReadonlySet<string> = new Set([
  'am',
  'pm',
  'a.m',
  'p.m',
  "o'clock",
  'tonight',
  'tomorrow',
  'today',
  'sharp',
  'service',
  'services',
  'meeting',
  'class',
  'hour',
]);

function preferPassage(
  candidates: ReadonlyArray<Candidate>,
  n: number,
  chapter: boolean,
): Candidate[] {
  const fits = candidates.filter((c) => inPassage(c, n, chapter));
  return [...fits, ...candidates.filter((c) => !fits.includes(c))];
}

function nearSong(tokens: readonly Token[], i: number): boolean {
  for (let k = Math.max(0, i - 6); k < Math.min(tokens.length, i + 6); k++) {
    if (SONG_WORDS.has(tokens[k]?.clean ?? '')) return true;
  }
  return false;
}

type Candidate = { book: OsisBook; chapter: number; passage?: BibleRef };
type Contexts = { candidates: Candidate[]; immediate: boolean };

/** Does `n` (a verse, or a chapter when `chapter`) fall in the sermon's
 * primary passage? Then it beats a more recent aside. */
function inPassage(context: Candidate, n: number, chapter: boolean): boolean {
  const passage = context.passage;
  if (!passage || passage.chapter === undefined) return false;
  if (chapter)
    return n >= passage.chapter && n <= (passage.endChapter ?? passage.chapter);
  // A whole-chapter passage ("Hebrews 1") claims every verse in it.
  if (passage.verse === undefined)
    return n <= verseCount(passage.book, passage.chapter);
  if (passage.endChapter !== undefined) return false;
  return n >= passage.verse && n <= (passage.endVerse ?? passage.verse);
}

function readImplied(
  tokens: readonly Token[],
  i: number,
  stop: number,
  { candidates, immediate }: Contexts,
): { found: FoundRef; setsChapter: boolean } | null {
  const ordered = (n: number, chapter: boolean) =>
    immediate ? candidates : preferPassage(candidates, n, chapter);
  const token = tokens[i];
  if (!token || token.lead !== '' || candidates.length === 0) return null;
  const word = token.clean;
  if (isBareChapterVerse(tokens, i)) {
    // "10 .19", "10:32 through 10:39" in an outline of the book.
    const cv = readChapterVerse(tokens, i);
    if (!cv || cv.end > stop || cv.verse === undefined) return null;
    for (const { book } of ordered(cv.chapter, true)) {
      const ref = validateBibleRef({
        book,
        chapter: cv.chapter,
        verse: cv.verse,
        endChapter: cv.endChapter,
        endVerse: cv.endVerse,
      });
      if (ref)
        return { found: { start: i, end: cv.end, ref }, setsChapter: true };
    }
    return null;
  }
  if (!VERSE_WORDS.has(word) && !CHAPTER_WORDS.has(word)) return null;
  // "verse by verse", "chapter and verse": no number, no reference.
  if (token.trail !== '' && token.trail !== ',') return null;
  if (nearSong(tokens, i)) return null;

  if (VERSE_WORDS.has(word)) {
    const n = parseNumber(tokens, i + 1);
    if (!n || n.end > stop) return null;
    const range = readRangeEnd(tokens, n.end, true, n.value);
    const end =
      range && range.endChapter === undefined && (range.endVerse ?? 0) > n.value
        ? range
        : null;
    if (end && end.end > stop) return null;
    for (const context of ordered(n.value, false)) {
      const ref = validateBibleRef({
        ...context,
        verse: n.value,
        endVerse: end?.endVerse,
      });
      if (ref) {
        return {
          found: { start: i, end: end?.end ?? n.end, ref },
          setsChapter: false,
        };
      }
    }
    return null;
  }

  const cv = readChapterVerse(tokens, i + 1);
  if (!cv || cv.end > stop) return null;
  // "chapter 3 of his book" — a chapter of something else.
  if (tokens[cv.end]?.clean === 'of') return null;
  for (const { book } of ordered(cv.chapter, true)) {
    const ref = validateBibleRef({
      book,
      chapter: cv.chapter,
      verse: cv.verse,
      endChapter: cv.endChapter,
      endVerse: cv.endVerse,
    });
    if (ref) {
      return { found: { start: i, end: cv.end, ref }, setsChapter: true };
    }
  }
  return null;
}
