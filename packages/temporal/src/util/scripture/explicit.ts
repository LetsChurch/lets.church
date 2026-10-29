// Layer 1: explicit, spoken Scripture citations ("Romans 8:28", "Second
// Timothy 1 .5", "Jude, verse three", "2 Timothy 3, 14 through 17").
//
// We find candidates ourselves rather than handing raw text to a general
// reference parser: those are tuned for written text and are aggressive on
// prose ("she is 2 cool" → Isaiah 2). Anchoring on a capitalized, spelled-out
// book name and reading the spoken chapter/verse grammar after it keeps
// precision high, and versification checks reject impossible references.

import {
  BOOK_NAMES,
  ORDINALS,
  SINGLE_CHAPTER_BOOKS,
  type BookName,
  type OsisBook,
} from './books';
import { isCapitalized, parseNumber, type Token } from './tokens';
import { validateBibleRef, type BibleRef } from './versification';

export type FoundRef = {
  // Token range [start, end) within the paragraph.
  start: number;
  end: number;
  ref: BibleRef;
};

export const VERSE_WORDS: ReadonlySet<string> = new Set([
  'verse',
  'verses',
  'v',
  'vv',
]);
export const CHAPTER_WORDS: ReadonlySet<string> = new Set([
  'chapter',
  'chapters',
]);
const RANGE_WORDS: ReadonlySet<string> = new Set([
  'through',
  'thru',
  'to',
  'until',
  'till',
]);
// A number followed by one of these is a count, not a chapter ("Mark 2
// times"), unless a verse made the citation unambiguous.
const UNIT_WORDS: ReadonlySet<string> = new Set([
  'times',
  'time',
  'years',
  'year',
  'days',
  'day',
  'weeks',
  'week',
  'months',
  'month',
  'hours',
  'hour',
  'minutes',
  'minute',
  'seconds',
  'people',
  'men',
  'women',
  'kids',
  'children',
  'percent',
  'dollars',
  'thousand',
  'million',
  "o'clock",
  'of',
]);

// Longest names first so "song of songs" wins over a shorter prefix.
const NAMES_BY_LENGTH = [...BOOK_NAMES].sort(
  (a, b) => b.tokens.length - a.tokens.length,
);

type BookMatch = {
  osis: OsisBook;
  start: number;
  // Exclusive token index after the book name.
  end: number;
  name: BookName;
  ordinal: boolean;
};

function matchName(
  tokens: readonly Token[],
  j: number,
  name: BookName,
): boolean {
  for (let k = 0; k < name.tokens.length; k++) {
    const token = tokens[j + k];
    if (!token || token.clean !== name.tokens[k]) return false;
    // Only the last word of a multi-word name may carry punctuation.
    if (k < name.tokens.length - 1 && token.trail !== '') return false;
  }
  // Transcripts capitalize book names; "job" and "mark" lowercase are words.
  return isCapitalized(tokens[j]);
}

/** The book ordinal (1-3) `tokens[i]` would be, if it can be one: "verse 2
 * John says" — a digit right after a chapter/verse word or a number is that
 * number, not an ordinal. */
function ordinalAt(tokens: readonly Token[], i: number): 1 | 2 | 3 | null {
  const token = tokens[i];
  if (!token || token.trail !== '') return null;
  const ordinal = ORDINALS[token.clean];
  if (ordinal === undefined) return null;
  const prev = tokens[i - 1];
  const afterNumber =
    !!prev &&
    prev.trail === '' &&
    (VERSE_WORDS.has(prev.clean) ||
      CHAPTER_WORDS.has(prev.clean) ||
      /^\d+$/.test(prev.clean));
  return /^\d/.test(token.clean) && afterNumber ? null : ordinal;
}

export function matchBook(
  tokens: readonly Token[],
  i: number,
): BookMatch | null {
  const ordinal = ordinalAt(tokens, i);
  if (ordinal !== null) {
    for (const name of NAMES_BY_LENGTH) {
      if (!name.numbered || !matchName(tokens, i + 1, name)) continue;
      const osis = name.numbered[ordinal - 1];
      if (!osis) continue;
      return {
        osis,
        start: i,
        end: i + 1 + name.tokens.length,
        name,
        ordinal: true,
      };
    }
  }
  // An unnumbered match right after an ordinal is the numbered book's tail
  // ("2 Corinthians" read from "Corinthians"); the ordinal start owns it.
  if (ordinalAt(tokens, i - 1) !== null && matchBook(tokens, i - 1)) {
    return null;
  }
  for (const name of NAMES_BY_LENGTH) {
    if (!name.osis || !matchName(tokens, i, name)) continue;
    return {
      osis: name.osis,
      start: i,
      end: i + name.tokens.length,
      name,
      ordinal: false,
    };
  }
  return null;
}

type ChapterVerse = {
  chapter: number;
  verse?: number;
  endChapter?: number;
  endVerse?: number;
  chapterOnly: boolean;
  // Exclusive token index after the parsed reference.
  end: number;
  // Index just past the chapter, for falling back to a chapter-only ref.
  chapterEnd: number;
  spelled: boolean;
};

const COMPOUND_RE =
  /^(\d{1,3})[:.](\d{1,3})(?:[-–](?:(\d{1,3})[:.])?(\d{1,3}))?$/;
const DASH_RANGE_RE = /^(\d{1,3})[-–](\d{1,3})$/;

/** A verse number after a chapter: "3, 16", "3 .16", "3 16", "3, verse
 * 16", "3 verse sixteen". Spelled-out verses need the word "verse": "Psalm 23,
 * one of my favorites" isn't Psalm 23:1. */
function readVerse(
  tokens: readonly Token[],
  afterChapter: number,
): { verse: number; end: number } | null {
  const chapterToken = tokens[afterChapter - 1];
  const next = tokens[afterChapter];
  if (!chapterToken || !next) return null;
  const trail = chapterToken.trail;
  if (trail !== '' && trail !== ':' && trail !== ',') return null;
  if (VERSE_WORDS.has(next.clean) && next.lead === '') {
    if (next.trail !== '' && next.trail !== ',') return null;
    const n = parseNumber(tokens, afterChapter + 1);
    return n ? { verse: n.value, end: n.end } : null;
  }
  if (next.lead !== '' && next.lead !== '.' && next.lead !== ':') return null;
  if (!/^\d{1,3}$/.test(next.clean)) return null;
  // "Romans 12, 2 Corinthians 5": the 2 starts the next citation.
  if (matchBook(tokens, afterChapter)) return null;
  return { verse: Number(next.clean), end: afterChapter + 1 };
}

/** "through 18", "- 18", "and 19", "to verse 18", "through chapter 2 verse
 * 18", "through 2:18". */
export function readRangeEnd(
  tokens: readonly Token[],
  at: number,
  hasVerse: boolean,
  // The number the range would start from: "and" only joins consecutive
  // numbers ("18 and 19", "Romans 1 and 2"); "8:28 and 31" is a list.
  from?: number,
): { endChapter?: number; endVerse?: number; end: number } | null {
  const prev = tokens[at - 1];
  const token = tokens[at];
  if (!prev || !token) return null;
  if (prev.trail !== '' && prev.trail !== '-' && prev.trail !== '–') {
    return null;
  }
  let j = at;
  if (prev.trail === '-' || prev.trail === '–') {
    // "16- 18": the dash rode on the previous token.
  } else if (RANGE_WORDS.has(token.clean) || token.raw === '-') {
    j += 1;
  } else if (token.clean === 'and' && from !== undefined) {
    const next = parseNumber(tokens, at + 1);
    if (!next || next.value !== from + 1) return null;
    return hasVerse
      ? { endVerse: next.value, end: next.end }
      : { endChapter: next.value, end: next.end };
  } else if (token.lead === '-' || token.lead === '–') {
    // "16 -18"
  } else {
    return null;
  }
  let chapterKeyword = false;
  if (VERSE_WORDS.has(tokens[j]?.clean ?? '')) j += 1;
  else if (CHAPTER_WORDS.has(tokens[j]?.clean ?? '')) {
    chapterKeyword = true;
    j += 1;
  }
  const compound = COMPOUND_RE.exec(tokens[j]?.clean ?? '');
  if (compound && !compound[3] && !compound[4]) {
    return {
      endChapter: Number(compound[1]),
      endVerse: Number(compound[2]),
      end: j + 1,
    };
  }
  const n = parseNumber(tokens, j);
  if (!n) return null;
  if (chapterKeyword) {
    const verse = readVerse(tokens, n.end);
    return verse
      ? { endChapter: n.value, endVerse: verse.verse, end: verse.end }
      : { endChapter: n.value, end: n.end };
  }
  return hasVerse
    ? { endVerse: n.value, end: n.end }
    : { endChapter: n.value, end: n.end };
}

/** Chapter[:verse][-end] starting at `tokens[at]` (after the book or a
 * "chapter" keyword). */
export function readChapterVerse(
  tokens: readonly Token[],
  at: number,
): ChapterVerse | null {
  const token = tokens[at];
  if (!token) return null;
  const compound = COMPOUND_RE.exec(token.clean);
  if (compound) {
    const chapter = Number(compound[1]);
    const verse = Number(compound[2]);
    const cv: ChapterVerse = {
      chapter,
      verse,
      chapterOnly: false,
      end: at + 1,
      chapterEnd: at + 1,
      spelled: false,
    };
    if (compound[4]) {
      if (compound[3]) cv.endChapter = Number(compound[3]);
      cv.endVerse = Number(compound[4]);
      return cv;
    }
    applyRange(cv, readRangeEnd(tokens, at + 1, true, verse));
    return cv;
  }
  const dash = DASH_RANGE_RE.exec(token.clean);
  if (dash) {
    return {
      chapter: Number(dash[1]),
      endChapter: Number(dash[2]),
      chapterOnly: true,
      end: at + 1,
      chapterEnd: at + 1,
      spelled: false,
    };
  }
  const n = parseNumber(tokens, at);
  if (!n) return null;
  const cv: ChapterVerse = {
    chapter: n.value,
    chapterOnly: true,
    end: n.end,
    chapterEnd: n.end,
    spelled: n.spelled,
  };
  const verse = readVerse(tokens, n.end);
  if (verse) {
    cv.verse = verse.verse;
    cv.chapterOnly = false;
    cv.end = verse.end;
  }
  applyRange(
    cv,
    readRangeEnd(tokens, cv.end, !cv.chapterOnly, cv.verse ?? cv.chapter),
  );
  return cv;
}

/** Take a range end only when it runs forward ("Romans 8 to one another"
 * isn't Romans 8-1). */
function applyRange(
  cv: ChapterVerse,
  range: ReturnType<typeof readRangeEnd>,
): void {
  if (!range) return;
  const endChapter = range.endChapter ?? cv.chapter;
  if (endChapter < cv.chapter) return;
  if (endChapter === cv.chapter) {
    if (range.endVerse === undefined || cv.verse === undefined) return;
    if (range.endVerse <= cv.verse) return;
  }
  Object.assign(cv, range);
}

/** A citation anchored on the book name at `tokens[i]`. */
function parseCitation(tokens: readonly Token[], i: number): FoundRef | null {
  const book = matchBook(tokens, i);
  if (!book) return null;
  let j = book.end;
  const single = SINGLE_CHAPTER_BOOKS.has(book.osis);
  // "superior to Joshua, chapter 4" — a person compared with, then the
  // chapter of the passage being outlined. "Turn to Matthew, chapter 5" is a
  // citation: only a comparison before the name makes it the person.
  if (
    book.name.person &&
    !book.ordinal &&
    !single &&
    tokens[j - 1]?.trail === ',' &&
    isComparison(tokens, i)
  ) {
    return null;
  }
  let chapterKeyword = false;
  let verseKeyword = false;
  if (CHAPTER_WORDS.has(tokens[j]?.clean ?? '')) {
    chapterKeyword = true;
    j += 1;
  } else if (single && VERSE_WORDS.has(tokens[j]?.clean ?? '')) {
    verseKeyword = true;
    j += 1;
  }
  const cv = readChapterVerse(tokens, j);
  if (!cv) return null;

  let ref: Record<string, unknown>;
  if (single && (verseKeyword || !(chapterKeyword && cv.chapter === 1))) {
    // Jude 3 / Jude verse 3 / Jude 1:3 / Philemon 17 and 18.
    const verse = cv.chapter === 1 && cv.verse ? cv.verse : cv.chapter;
    const endVerse =
      cv.chapter === 1 && cv.verse
        ? cv.endVerse
        : (cv.endChapter ?? cv.endVerse);
    ref = { book: book.osis, chapter: 1, verse, endVerse };
  } else {
    ref = {
      book: book.osis,
      chapter: cv.chapter,
      verse: cv.verse,
      endChapter: cv.endChapter,
      endVerse: cv.endVerse,
    };
  }

  const hasVerse = ref.verse !== undefined;
  // Single-chapter books always get a verse ("Jude 3" is Jude 1:3), so the
  // guards key off whether a verse was actually *said* — otherwise "Jude, one
  // of the brothers" and "Philemon two times" slip through.
  const spokenVerse = verseKeyword || cv.verse !== undefined;
  if (!spokenVerse && !chapterKeyword) {
    // "John one of the twelve", "Mark 2 times": a bare number after a name
    // that doubles as a person or precedes a unit isn't a citation.
    if (book.name.person && !book.ordinal && cv.spelled) return null;
    if (UNIT_WORDS.has(tokens[cv.end]?.clean ?? '')) return null;
    // "the Romans 2 legions" — the people, not the letter.
    if (RECIPIENT_BOOKS.has(book.osis) && followsDeterminer(tokens, i)) {
      return null;
    }
  }

  const valid = validateBibleRef(ref);
  if (valid) return { start: book.start, end: cv.end, ref: valid };
  // An impossible verse ("Romans 8, 40 years") still leaves a good chapter.
  if (!hasVerse || single) return null;
  const chapterOnly = validateBibleRef({
    book: book.osis,
    chapter: cv.chapter,
  });
  return chapterOnly
    ? { start: book.start, end: cv.chapterEnd, ref: chapterOnly }
    : null;
}

const BOOK_PHRASE_HEADS: ReadonlySet<string> = new Set([
  'book',
  'gospel',
  'letter',
  'epistle',
]);
// Books named on their own that are not also people or groups.
const STANDALONE_BOOKS: ReadonlySet<OsisBook> = new Set([
  'Gen',
  'Exod',
  'Lev',
  'Deut',
  'Ps',
  'Prov',
  'Eccl',
  'Song',
  'Lam',
  'Rev',
]);
// Standalone books that keep their article: "the Psalms", "the Song of Songs".
const DETERMINED_BOOKS: ReadonlySet<OsisBook> = new Set(['Ps', 'Prov', 'Song']);
// Letters named for their recipients: a book unless it's "the Romans".
const RECIPIENT_BOOKS: ReadonlySet<OsisBook> = new Set([
  'Rom',
  'Gal',
  'Eph',
  'Phil',
  'Col',
  'Heb',
]);
const GROUP_DETERMINERS: ReadonlySet<string> = new Set([
  'the',
  'those',
  'these',
  'to',
]);
// "the Exodus from Egypt", "a Revelation of his glory" — events, not books.
const ARTICLES: ReadonlySet<string> = new Set([
  'the',
  'a',
  'an',
  'this',
  'that',
]);

const COMPARATIVES: ReadonlySet<string> = new Set([
  'superior',
  'inferior',
  'greater',
  'better',
  'compared',
  'similar',
  'like',
  'unlike',
]);

/** "superior to Joshua", "greater than Moses", "like Jonah". */
function isComparison(tokens: readonly Token[], i: number): boolean {
  const prev = tokens[i - 1]?.clean ?? '';
  const before = tokens[i - 2]?.clean ?? '';
  return (
    COMPARATIVES.has(prev) ||
    ((prev === 'to' || prev === 'than' || prev === 'with') &&
      COMPARATIVES.has(before))
  );
}

function followsDeterminer(
  tokens: readonly Token[],
  i: number,
  determiners: ReadonlySet<string> = GROUP_DETERMINERS,
): boolean {
  const prev = tokens[i - 1];
  return !!prev && prev.trail === '' && determiners.has(prev.clean);
}

// A bare book name needs reading context — "in Romans", "read Revelation",
// "Hebrews says" — or it's a people, an event or a sentence-initial word
// ("Romans crucified thousands", "Revelation is God making himself known").
const BOOK_CONTEXT_BEFORE: ReadonlySet<string> = new Set([
  'in',
  'from',
  'of',
  'through',
  'throughout',
  'into',
  'read',
  'reading',
  'open',
  'opening',
  'turn',
  'see',
  'study',
  'studying',
  'preach',
  'preached',
  'preaching',
  'teach',
  'teaching',
]);
const BOOK_CONTEXT_AFTER: ReadonlySet<string> = new Set([
  'says',
  'say',
  'said',
  'tells',
  'teaches',
  'records',
  'describes',
]);

// Book names that are also everyday words.
const COMMON_NOUN_BOOKS: ReadonlySet<OsisBook> = new Set([
  'Exod',
  'Rev',
  'Lam',
]);

function startsSentence(tokens: readonly Token[], i: number): boolean {
  const prev = tokens[i - 1];
  return !prev || /[.?!]/.test(prev.trail);
}

function readsAsBook(
  tokens: readonly Token[],
  start: number,
  end: number,
): boolean {
  let k = start - 1;
  if (ARTICLES.has(tokens[k]?.clean ?? '') && tokens[k]?.trail === '') k -= 1;
  const before = tokens[k];
  return (
    (!!before &&
      before.trail === '' &&
      BOOK_CONTEXT_BEFORE.has(before.clean)) ||
    (tokens[end - 1]?.trail === '' &&
      BOOK_CONTEXT_AFTER.has(tokens[end]?.clean ?? ''))
  );
}

/** Whole-book mentions with no chapter: "the book of Jude", "the Gospel of
 * John", "First Corinthians", "in Ecclesiastes". */
function parseBookMention(
  tokens: readonly Token[],
  i: number,
): FoundRef | null {
  const head = tokens[i];
  if (head && BOOK_PHRASE_HEADS.has(head.clean) && head.trail === '') {
    let j = i + 1;
    const link = tokens[j]?.clean;
    if (link === 'of' || link === 'to') j += 1;
    else if (link === 'according' && tokens[j + 1]?.clean === 'to') j += 2;
    else return null;
    if (tokens[j]?.clean === 'the' && tokens[j - 1]?.trail === '') j += 1;
    // "the book of Romans 8" is a Romans 8 citation, found at the book name.
    if (parseCitation(tokens, j)) return null;
    const book = matchBook(tokens, j);
    if (!book) return null;
    return { start: i, end: book.end, ref: { book: book.osis } };
  }
  const book = matchBook(tokens, i);
  if (!book) return null;
  // Peoples ("Romans crucified…"), ordinals ("the first John") and
  // common-noun names ("Revelation is…") need reading context; the rest
  // ("this Proverbs series") only can't open a sentence, where any word is
  // capitalized.
  if (
    book.ordinal ||
    RECIPIENT_BOOKS.has(book.osis) ||
    COMMON_NOUN_BOOKS.has(book.osis)
      ? !readsAsBook(tokens, book.start, book.end)
      : startsSentence(tokens, book.start)
  ) {
    return null;
  }
  const named =
    book.ordinal ||
    // "the Exodus from Egypt", "the Revelation of his glory" are events, not
    // books; "the Psalms" and "the Proverbs" are the books.
    (STANDALONE_BOOKS.has(book.osis) &&
      (!followsDeterminer(tokens, i, ARTICLES) ||
        DETERMINED_BOOKS.has(book.osis))) ||
    (RECIPIENT_BOOKS.has(book.osis) && !followsDeterminer(tokens, i));
  return named
    ? { start: book.start, end: book.end, ref: { book: book.osis } }
    : null;
}

/**
 * Every explicit citation and named book in one paragraph, left to right,
 * non-overlapping. A citation consumes its book, so "Romans 8" is one Romans
 * 8 reference, not also a whole-book "Romans".
 */
export function findExplicitRefs(tokens: readonly Token[]): FoundRef[] {
  const found: FoundRef[] = [];
  let i = 0;
  while (i < tokens.length) {
    const hit = parseCitation(tokens, i) ?? parseBookMention(tokens, i);
    if (hit) {
      found.push(hit);
      i = hit.end;
    } else {
      i += 1;
    }
  }
  return found;
}
