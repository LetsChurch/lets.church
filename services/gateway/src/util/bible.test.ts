import { describe, test, expect } from 'vitest';
import { books, aliasesToBook, getBibleReferences } from './bible';

test('books', () => {
  expect(books).toMatchSnapshot();
});

test('aliasesToBook', () => {
  expect(aliasesToBook).toMatchSnapshot();
});

describe('getBibleReferences', () => {
  describe('individual cases', () => {
    test('Book name alone', () => {
      expect(Array.from(getBibleReferences('John'))).toMatchSnapshot();
    });

    test('Book name and chapter', () => {
      expect(Array.from(getBibleReferences('John 3'))).toMatchSnapshot();
      expect(Array.from(getBibleReferences('Jn 3'))).toMatchSnapshot();
    });

    describe('Book name, chapter, and chapter/verse or chapter/verse range', () => {
      test.each([
        'John 3:16',
        'John 3.16',
        'John 3, 16-18',
        'John 3:16-4:1',
        'John 3:16a-4:2a',
      ])('%s', (s) => {
        expect(Array.from(getBibleReferences(s))).toMatchSnapshot();
      });
    });

    describe('Book name, chapter, and verse range (spoken)', () => {
      test.each([
        'John 3 16 through 18',
        'John 3 16 to 18',
        'John 3, 16 to 18',
        'John 3, 16, to 18',
        'Romans Chapter 1 Verse 20',
        'Romans Chapter 1 Verse 20b',
        'Jude 1 to 3',
      ])('%s', (s) => {
        expect(Array.from(getBibleReferences(s))).toMatchSnapshot();
      });
    });

    describe('TODO', () => {
      test.fails('verbose spoken', () => {
        expect(
          Array.from(
            getBibleReferences(
              'Romans Chapter 1 Verse 20 through Chapter 2 Verse 3',
            ),
          ),
        ).toMatchInlineSnapshot(`
          [
            {
              "book": "Romans",
              "chapter": 1,
              "chapterEnd": 2,
              "index": 0,
              "match": "Romans Chapter 1 Verse 20 through Chapter 2 Verse 3",
              "verse": 20,
              "verseEnd": 3,
            },
          ]
        `);
      });

      test.fails('Numbers 18, 8, 11, 19', () => {
        expect(
          Array.from(getBibleReferences('Numbers 18, 8, 11, 19')),
          // Num18:8,11,19
        ).toMatchInlineSnapshot(`
          [
            {
              "book": "Numbers",
              "chapter": 18,
              "chapterEnd": 18,
              "index": 0,
              "match": "Numbers 18, 8, 11, 19",
              "verse": 8,
              "verseEnd": 8,
            },
            {
              "book": "Numbers",
              "chapter": 18,
              "chapterEnd": 18,
              "index": 0,
              "match": "Numbers 18, 8, 11, 19",
              "verse": 11,
              "verseEnd": 11,
            },
            {
              "book": "Numbers",
              "chapter": 18,
              "chapterEnd": 18,
              "index": 0,
              "match": "Numbers 18, 8, 11, 19",
              "verse": 19,
              "verseEnd": 19,
            },
          ]
        `);
      });
    });
  });

  describe('incorrect transcriptions', () => {
    describe('large numbers', () => {
      test.each([
        'john 316',
        'romans 1516',
        'john 316 to 18',
        'jude 34',
        'First Samuel 2, 12th through 17',
      ])('%s', (s) => {
        expect(Array.from(getBibleReferences(s))).toMatchSnapshot();
      });
    });
  });

  describe('compound cases', () => {
    test('getBibleReferences', () => {
      expect(
        Array.from(
          getBibleReferences(
            'Genesis can be abbreviated gn or Gen and Exodus 22 as Ex 22. Romans 1:20 is the same as Romans Chapter 1 Verse 20 or even Rm 1:20.',
          ),
        ),
      ).toMatchSnapshot();
    });
  });
});
