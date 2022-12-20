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

    test('Book name, chapter, and verse or verse range', () => {
      expect(Array.from(getBibleReferences('John 3:16'))).toMatchSnapshot();
      expect(Array.from(getBibleReferences('John 3.16'))).toMatchSnapshot();
      expect(Array.from(getBibleReferences('John 3, 16-18'))).toMatchSnapshot();
    });

    describe('Book name, chapter, and verse range (spoken)', () => {
      test.each([
        'John 3 16 through 18',
        'John 3 16 to 18',
        'John 3, 16 to 18',
        'John 3, 16, to 18',
        'Jude 1 to 3',
      ])('%s', (s) => {
        expect(Array.from(getBibleReferences(s))).toMatchSnapshot();
      });
    });
  });

  describe('incorrect transcriptions', () => {
    describe('large numbers', () => {
      test.each(['john 316', 'romans 1516', 'john 316 to 18', 'jude 34'])(
        '%s',
        (s) => {
          expect(Array.from(getBibleReferences(s))).toMatchSnapshot();
        },
      );
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
