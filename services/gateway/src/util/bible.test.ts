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
      expect(Array.from(getBibleReferences('John'))).toMatchInlineSnapshot(`
        [
          {
            "book": "John",
            "chapter": undefined,
            "index": 0,
            "match": "John",
            "verse": undefined,
            "verseEnd": undefined,
          },
        ]
      `);
    });

    test('Book name and chapter', () => {
      expect(Array.from(getBibleReferences('John 3'))).toMatchInlineSnapshot(`
        [
          {
            "book": "John",
            "chapter": 3,
            "index": 0,
            "match": "John 3",
            "verse": undefined,
            "verseEnd": undefined,
          },
        ]
      `);
    });

    test('Book name, chapter, and verse or verse range', () => {
      expect(Array.from(getBibleReferences('John 3:16')))
        .toMatchInlineSnapshot(`
          [
            {
              "book": "John",
              "chapter": 3,
              "index": 0,
              "match": "John 3:16",
              "verse": 16,
              "verseEnd": undefined,
            },
          ]
        `);
      expect(Array.from(getBibleReferences('John 3.16')))
        .toMatchInlineSnapshot(`
          [
            {
              "book": "John",
              "chapter": 3,
              "index": 0,
              "match": "John 3.16",
              "verse": 16,
              "verseEnd": undefined,
            },
          ]
        `);
      expect(Array.from(getBibleReferences('John 3:16-18')))
        .toMatchInlineSnapshot(`
          [
            {
              "book": "John",
              "chapter": 3,
              "index": 0,
              "match": "John 3:16-18",
              "verse": 16,
              "verseEnd": 18,
            },
          ]
        `);
      expect(Array.from(getBibleReferences('John 3.16-18')))
        .toMatchInlineSnapshot(`
          [
            {
              "book": "John",
              "chapter": 3,
              "index": 0,
              "match": "John 3.16-18",
              "verse": 16,
              "verseEnd": 18,
            },
          ]
        `);
      expect(Array.from(getBibleReferences('John 3, 16-18')))
        .toMatchInlineSnapshot(`
        [
          {
            "book": "John",
            "chapter": 3,
            "index": 0,
            "match": "John 3, 16-18",
            "verse": 16,
            "verseEnd": 18,
          },
        ]
      `);
    });

    test('Book name, chapter, and verse range (spoken)', () => {
      expect(Array.from(getBibleReferences('John 3 16 through 18')))
        .toMatchInlineSnapshot(`
          [
            {
              "book": "John",
              "chapter": 3,
              "index": 0,
              "match": "John 3 16 through 18",
              "verse": 16,
              "verseEnd": 18,
            },
          ]
        `);

      expect(Array.from(getBibleReferences('John 3, 16 through 18')))
        .toMatchInlineSnapshot(`
          [
            {
              "book": "John",
              "chapter": 3,
              "index": 0,
              "match": "John 3, 16 through 18",
              "verse": 16,
              "verseEnd": 18,
            },
          ]
        `);

      expect(Array.from(getBibleReferences('John 3, 16, through 18')))
        .toMatchInlineSnapshot(`
          [
            {
              "book": "John",
              "chapter": 3,
              "index": 0,
              "match": "John 3, 16, through 18",
              "verse": 16,
              "verseEnd": 18,
            },
          ]
        `);
    });
  });

  describe.only('incorrect transcriptions', () => {
    describe('large numbers', () => {
      test('john 316', () => {
        expect(Array.from(getBibleReferences('john 316')))
          .toMatchInlineSnapshot(`
          [
            {
              "book": "John",
              "chapter": 3,
              "index": 0,
              "match": "john 316",
              "verse": 16,
              "verseEnd": undefined,
            },
          ]
        `);
      });

      test('romans 1516', () => {
        expect(Array.from(getBibleReferences('romans 1516')))
          .toMatchInlineSnapshot(`
          [
            {
              "book": "Romans",
              "chapter": 15,
              "index": 0,
              "match": "romans 1516",
              "verse": 16,
              "verseEnd": undefined,
            },
          ]
        `);
      });
    });
  });

  describe('compound cases', () => {
    test.skip('getBibleReferences', () => {
      expect(
        Array.from(
          getBibleReferences(
            'Genesis can be abbreviated gn or Gen and Exodus 22 as Ex 22. Romans 1:20 is the same as Romans Chapter 1 Verse 20 or even Rm 1:20.',
          ),
        ),
      ).toMatchInlineSnapshot(`
        [
          {
            "book": "Genesis",
            "chapter": undefined,
            "index": 0,
            "match": "Genesis",
            "verse": undefined,
          },
          {
            "book": "Exodus",
            "chapter": 22,
            "index": 41,
            "match": "Exodus 22",
            "verse": undefined,
          },
          {
            "book": "Exodus",
            "chapter": 22,
            "index": 54,
            "match": "Ex 22",
            "verse": undefined,
          },
          {
            "book": "Romans",
            "chapter": 1,
            "index": 61,
            "match": "Romans 1:20",
            "verse": 20,
          },
          {
            "book": "Romans",
            "chapter": 1,
            "index": 88,
            "match": "Romans Chapter 1 Verse 20",
            "verse": 20,
          },
          {
            "book": "Romans",
            "chapter": 1,
            "index": 122,
            "match": "Rm 1:20",
            "verse": 20,
          },
        ]
      `);
    });
  });
});
