import { describe, test, expect } from 'vitest';
import {
  books,
  aliasesToBookName,
  getBibleRegex,
  getBibleReferences,
} from './bible';

test('books', () => {
  expect(books).toMatchSnapshot();
});

test('aliasesToBookName', () => {
  expect(aliasesToBookName).toMatchSnapshot();
});

describe('getBibleRegex', () => {
  test('regex', () => {
    expect(getBibleRegex()).toMatchSnapshot();
  });

  test('matches bare book names', () => {
    const regex = getBibleRegex();
    const res = regex.exec(
      'The book of Genesis is the first book of the Bible',
    );
    expect(res).toMatchInlineSnapshot(`
      [
        "Genesis ",
        "Genesis",
        undefined,
        undefined,
      ]
    `);
    expect(res?.groups).toMatchInlineSnapshot(`
      {
        "book": "Genesis",
        "chapter": undefined,
        "verse": undefined,
      }
    `);
  });

  test('matches book names with chapter', () => {
    const regex = getBibleRegex();
    const res = regex.exec("Genesis 50 speaks clearly of God's sovereignty");
    expect(res).toMatchInlineSnapshot(`
      [
        "Genesis 50",
        "Genesis",
        "50",
        undefined,
      ]
    `);
    expect(res?.groups).toMatchInlineSnapshot(`
      {
        "book": "Genesis",
        "chapter": "50",
        "verse": undefined,
      }
    `);
  });

  test('matches book names with chapter stated', () => {
    const regex = getBibleRegex();
    const res = regex.exec(
      "Genesis chapter 50 speaks clearly of God's sovereignty",
    );
    expect(res).toMatchInlineSnapshot(`
      [
        "Genesis chapter 50",
        "Genesis",
        "50",
        undefined,
      ]
    `);
    expect(res?.groups).toMatchInlineSnapshot(`
      {
        "book": "Genesis",
        "chapter": "50",
        "verse": undefined,
      }
    `);
  });

  test('matches book names with chapter and verse', () => {
    const regex = getBibleRegex();
    const res = regex.exec(
      'Genesis 50:20 says that what man intended for evil, God intended for good',
    );
    expect(res).toMatchInlineSnapshot(`
      [
        "Genesis 50:20",
        "Genesis",
        "50",
        "20",
      ]
    `);
    expect(res?.groups).toMatchInlineSnapshot(`
      {
        "book": "Genesis",
        "chapter": "50",
        "verse": "20",
      }
    `);
  });

  test('matches book names with chapter and verse (no colon)', () => {
    const regex = getBibleRegex();
    const res = regex.exec(
      'Genesis 50 20 says that what man intended for evil, God intended for good',
    );
    expect(res).toMatchInlineSnapshot(`
      [
        "Genesis 50 20",
        "Genesis",
        "50",
        "20",
      ]
    `);
    expect(res?.groups).toMatchInlineSnapshot(`
      {
        "book": "Genesis",
        "chapter": "50",
        "verse": "20",
      }
    `);
  });

  test('matches book names with chapter and verse (stated)', () => {
    const regex = getBibleRegex();
    const res = regex.exec(
      'Genesis chapter 50 verse 20 says that what man intended for evil, God intended for good',
    );
    expect(res).toMatchInlineSnapshot(`
      [
        "Genesis chapter 50 verse 20",
        "Genesis",
        "50",
        "20",
      ]
    `);
    expect(res?.groups).toMatchInlineSnapshot(`
      {
        "book": "Genesis",
        "chapter": "50",
        "verse": "20",
      }
    `);
  });
});

test('getBibleReferences', () => {
  expect([
    ...getBibleReferences(
      'Genesis can be abbreviated gn or Gen and Exodus 22 as Ex 22. Romans 1:20 is the same as Romans Chapter 1 Verse 20 or even Rm 1:20.',
    ),
  ]).toMatchInlineSnapshot(`
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
