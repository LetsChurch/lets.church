import { describe, expect, test } from 'vitest';

import { bibleRefsFromMetadata } from '../bible-refs';
import { normalizeSingleChapterRef } from './books';
import { validateBibleRef } from './versification';

describe('normalizeSingleChapterRef', () => {
  test.each([
    [
      { book: 'Jude', verse: 3 },
      { book: 'Jude', chapter: 1, verse: 3 },
    ],
    [
      { book: 'Jude', chapter: 3 },
      { book: 'Jude', chapter: 1, verse: 3 },
    ],
    [
      { book: 'Jude', chapter: 1, verse: 3 },
      { book: 'Jude', chapter: 1, verse: 3 },
    ],
    [
      { book: 'Phlm', chapter: 17, endChapter: 18 },
      { book: 'Phlm', chapter: 1, verse: 17, endVerse: 18 },
    ],
    [{ book: 'Jude' }, { book: 'Jude' }],
    [
      { book: 'Jude', chapter: 1, endChapter: 4 },
      { book: 'Jude', chapter: 1, verse: 1, endVerse: 4 },
    ],
    [
      { book: 'Jude', chapter: 1 },
      { book: 'Jude', chapter: 1 },
    ],
    [
      { book: 'John', verse: 3 },
      { book: 'John', verse: 3 },
    ],
  ])('%j → %j', (input, expected) => {
    expect(normalizeSingleChapterRef(input)).toEqual(expected);
  });
});

describe('validateBibleRef', () => {
  test.each([
    [
      { book: 'John', chapter: 3, verse: 16 },
      { book: 'John', chapter: 3, verse: 16 },
    ],
    [
      { book: 'John', chapter: '3', verse: '16' },
      { book: 'John', chapter: 3, verse: 16 },
    ],
    [
      { book: 'Jude', verse: 3 },
      { book: 'Jude', chapter: 1, verse: 3 },
    ],
    [{ book: 'Rom' }, { book: 'Rom' }],
    [
      { book: 'Rom', chapter: 1, endChapter: 11 },
      { book: 'Rom', chapter: 1, endChapter: 11 },
    ],
    // 3 John 15 exists in the ESV, not the KJV; either counts.
    [
      { book: '3John', chapter: 1, verse: 15 },
      { book: '3John', chapter: 1, verse: 15 },
    ],
    // An impossible or backwards end is dropped, keeping the start.
    [
      { book: 'John', chapter: 3, verse: 16, endVerse: 99 },
      { book: 'John', chapter: 3, verse: 16 },
    ],
    [
      { book: 'John', chapter: 3, verse: 16, endVerse: 2 },
      { book: 'John', chapter: 3, verse: 16 },
    ],
    [
      { book: 'Heb', chapter: 1, verse: 4, endChapter: 2, endVerse: 18 },
      { book: 'Heb', chapter: 1, verse: 4, endChapter: 2, endVerse: 18 },
    ],
  ])('%j → %j', (input, expected) => {
    expect(validateBibleRef(input)).toEqual(expected);
  });

  test.each([
    { book: 'Isa', chapter: 67 },
    { book: 'John', chapter: 3, verse: 37 },
    { book: 'John', verse: 3 },
    { book: 'Tob', chapter: 1 },
    { book: 'Jude', chapter: 1, verse: 26 },
  ])('rejects %j', (input) => {
    expect(validateBibleRef(input)).toBeNull();
  });
});

describe('bibleRefsFromMetadata', () => {
  test('indexes a chapterless single-chapter verse', () => {
    expect(bibleRefsFromMetadata({ book: 'Jude', verse: 3 })).toEqual([
      'Jude.1.3',
    ]);
  });
});
