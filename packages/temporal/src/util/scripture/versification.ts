import { bcv_parser } from 'bible-passage-reference-parser/esm/bcv_parser.js';
import * as en from 'bible-passage-reference-parser/esm/lang/en.js';

import {
  isOsisBook,
  normalizeSingleChapterRef,
  toPositiveInt,
  type OsisBook,
} from './books';

// Verse counts per chapter. English Bibles disagree at the edges (3 John has
// 15 verses in the ESV, 14 in the KJV), so a verse is valid when any common
// English system has it.
const SYSTEMS = ['default', 'kjv'] as const;

let counts: Map<string, number[]> | undefined;
function verseCounts(): Map<string, number[]> {
  if (counts) return counts;
  const parser = new bcv_parser(en);
  counts = new Map();
  for (const system of SYSTEMS) {
    const { chapters } = parser.translation_info(system);
    for (const [book, perChapter] of Object.entries(chapters)) {
      if (!isOsisBook(book)) continue;
      const existing = counts.get(book);
      counts.set(
        book,
        existing
          ? Array.from(
              { length: Math.max(existing.length, perChapter.length) },
              (_, i) => Math.max(perChapter[i] ?? 0, existing[i] ?? 0),
            )
          : [...perChapter],
      );
    }
  }
  return counts;
}

export function chapterCount(book: OsisBook): number {
  return verseCounts().get(book)?.length ?? 0;
}

export function verseCount(book: OsisBook, chapter: number): number {
  return verseCounts().get(book)?.[chapter - 1] ?? 0;
}

export type BibleRef = {
  book: OsisBook;
  chapter?: number;
  verse?: number;
  endChapter?: number;
  endVerse?: number;
};

/**
 * Canonicalize a BIBLE reference and check it exists: pins single-chapter
 * books to chapter 1, then validates every chapter/verse against the
 * versification. An impossible start makes the whole reference invalid
 * (null); an impossible or backwards end is dropped, keeping the start, since
 * the start is what the speaker said first and is usually right.
 */
export function validateBibleRef(
  input: Record<string, unknown>,
): BibleRef | null {
  const meta = normalizeSingleChapterRef(input);
  if (typeof meta.book !== 'string' || !isOsisBook(meta.book)) return null;
  const book = meta.book;
  const chapter = toPositiveInt(meta.chapter);
  const verse = toPositiveInt(meta.verse);
  const endChapter = toPositiveInt(meta.endChapter);
  const endVerse = toPositiveInt(meta.endVerse);

  if (chapter === null) {
    // A verse needs a chapter (single-chapter books were pinned above).
    return verse === null ? { book } : null;
  }
  if (chapter > chapterCount(book)) return null;
  if (verse !== null && verse > verseCount(book, chapter)) return null;

  const ref: BibleRef = { book, chapter };
  if (verse !== null) ref.verse = verse;

  const lastChapter = endChapter ?? chapter;
  if (lastChapter < chapter || lastChapter > chapterCount(book)) return ref;
  if (verse === null) {
    // Chapter range ("Romans 1 through 3"); a verse-level end on a
    // chapter-level start is ambiguous, so only whole chapters are kept.
    if (lastChapter > chapter && endVerse === null)
      ref.endChapter = lastChapter;
    return ref;
  }
  if (endVerse === null) {
    // "John 3:16 through chapter 4" — end at the last verse of chapter 4.
    if (lastChapter > chapter) {
      ref.endChapter = lastChapter;
      ref.endVerse = verseCount(book, lastChapter);
    }
    return ref;
  }
  if (endVerse > verseCount(book, lastChapter)) return ref;
  if (lastChapter === chapter) {
    if (endVerse > verse) ref.endVerse = endVerse;
    return ref;
  }
  ref.endChapter = lastChapter;
  ref.endVerse = endVerse;
  return ref;
}
