import { describe, expect, test } from 'vitest';

import { findExplicitRefs } from './explicit';
import { tokenize } from './tokens';

function refs(text: string) {
  const tokens = tokenize(text);
  return findExplicitRefs(tokens).map(({ start, end, ref }) => ({
    span: tokens
      .slice(start, end)
      .map((t) => t.raw)
      .join(' '),
    ref,
  }));
}

describe('findExplicitRefs', () => {
  test.each([
    ['John 3:16', { book: 'John', chapter: 3, verse: 16 }],
    ['John 3, 16', { book: 'John', chapter: 3, verse: 16 }],
    ['John 3 .16', { book: 'John', chapter: 3, verse: 16 }],
    ['John 3 16', { book: 'John', chapter: 3, verse: 16 }],
    ['John chapter 3 verse 16', { book: 'John', chapter: 3, verse: 16 }],
    [
      'John chapter three, verse sixteen',
      { book: 'John', chapter: 3, verse: 16 },
    ],
    ['Job chapter nine, verse two,', { book: 'Job', chapter: 9, verse: 2 }],
    ['Second Timothy 1 .5', { book: '2Tim', chapter: 1, verse: 5 }],
    [
      '2 Timothy 3, 14 through 17',
      { book: '2Tim', chapter: 3, verse: 14, endVerse: 17 },
    ],
    [
      '2 Peter 3, 15 through 16,',
      { book: '2Pet', chapter: 3, verse: 15, endVerse: 16 },
    ],
    [
      'Deuteronomy 6, 6 through 9,',
      { book: 'Deut', chapter: 6, verse: 6, endVerse: 9 },
    ],
    ['Psalm 119, 130', { book: 'Ps', chapter: 119, verse: 130 }],
    ['Acts 20:29-38', { book: 'Acts', chapter: 20, verse: 29, endVerse: 38 }],
    [
      'Hebrews 1:4-2:18',
      { book: 'Heb', chapter: 1, verse: 4, endChapter: 2, endVerse: 18 },
    ],
    [
      'Hebrews 1:4 through chapter 2, verse 18',
      { book: 'Heb', chapter: 1, verse: 4, endChapter: 2, endVerse: 18 },
    ],
    ['Romans 8', { book: 'Rom', chapter: 8 }],
    ['Romans chapter one', { book: 'Rom', chapter: 1 }],
    ['Romans 1 and 2', { book: 'Rom', chapter: 1, endChapter: 2 }],
    ['Isaiah 1 through 8', { book: 'Isa', chapter: 1, endChapter: 8 }],
    ['Ecclesiastes five', { book: 'Eccl', chapter: 5 }],
    [
      'Ecclesiastes 5, 10 through 12',
      { book: 'Eccl', chapter: 5, verse: 10, endVerse: 12 },
    ],
    ['Romans five, 12?', { book: 'Rom', chapter: 5, verse: 12 }],
    ['Proverbs 19 11', { book: 'Prov', chapter: 19, verse: 11 }],
    [
      'Proverbs, chapter 27, verse 17,',
      { book: 'Prov', chapter: 27, verse: 17 },
    ],
    ['Song of Solomon 5, 4', { book: 'Song', chapter: 5, verse: 4 }],
    ['1 John chapter 5', { book: '1John', chapter: 5 }],
    ['third John 4', { book: '3John', chapter: 1, verse: 4 }],
    ['Jude 3', { book: 'Jude', chapter: 1, verse: 3 }],
    ['Jude, verse three.', { book: 'Jude', chapter: 1, verse: 3 }],
    ['Jude 1:23', { book: 'Jude', chapter: 1, verse: 23 }],
    [
      'Philemon 17 and 18,',
      { book: 'Phlm', chapter: 1, verse: 17, endVerse: 18 },
    ],
    ['Revelations 3:20', { book: 'Rev', chapter: 3, verse: 20 }],
  ])('%s', (text, ref) => {
    expect(refs(text)).toEqual([{ span: text, ref }]);
  });

  test.each([
    ['Romans 8:28 and 31', { book: 'Rom', chapter: 8, verse: 28 }],
    ['Romans 8:28 and 9:1', { book: 'Rom', chapter: 8, verse: 28 }],
    [
      'Romans 8:28 and 29',
      { book: 'Rom', chapter: 8, verse: 28, endVerse: 29 },
    ],
    ['Romans 3 and 5', { book: 'Rom', chapter: 3 }],
  ])('"and" joins only consecutive numbers: %s', (text, ref) => {
    expect(refs(text)[0]?.ref).toEqual(ref);
  });

  test('a following numbered book is not a verse', () => {
    expect(refs('Read Romans 12, 2 Corinthians 5').map((r) => r.ref)).toEqual([
      { book: 'Rom', chapter: 12 },
      { book: '2Cor', chapter: 5 },
    ]);
  });

  test.each([
    [
      'Turn with me to Matthew, chapter 5, verse 3.',
      { book: 'Matt', chapter: 5, verse: 3 },
    ],
    ['Open to John, chapter 3.', { book: 'John', chapter: 3 }],
  ])('cites a person-named book after a comma: %s', (text, ref) => {
    expect(refs(text).map((r) => r.ref)).toEqual([ref]);
  });

  test('a compared person is not a citation', () => {
    expect(refs('superior to Joshua, chapter 4, verses 1 through 13')).toEqual(
      [],
    );
  });

  test('stops the span at the end of the citation', () => {
    expect(
      refs('as Paul says in Romans 8:28, all things work together'),
    ).toEqual([
      { span: 'Romans 8:28,', ref: { book: 'Rom', chapter: 8, verse: 28 } },
    ]);
  });

  test('finds several citations in one paragraph', () => {
    expect(
      refs(
        'John 4 reads, Jesus said. And then 1 Corinthians 3 says, do you know',
      ).map((r) => r.ref),
    ).toEqual([
      { book: 'John', chapter: 4 },
      { book: '1Cor', chapter: 3 },
    ]);
  });

  test.each([
    ['Romans 8, 40 years later', 'Romans 8,', { book: 'Rom', chapter: 8 }],
    ['John 3:99', 'John 3:99', { book: 'John', chapter: 3 }],
    ['Psalm 23, one of my favorites', 'Psalm 23,', { book: 'Ps', chapter: 23 }],
  ])('keeps only the chapter in %s', (text, span, ref) => {
    expect(refs(text)).toEqual([{ span, ref }]);
  });

  test.each([
    'she is 2 cool',
    'Isaiah 70',
    'the job 3 days ago',
    'John one of the twelve',
    'Mark 2 times',
    'Peter 2 said',
    'it took 2 Kings',
    'the Romans 2 legions',
    'Jude, one of the brothers of Jesus',
    'Philemon two times over',
    'Jude 2 times',
  ])('rejects %s', (text) => {
    expect(refs(text).filter((r) => r.ref.chapter !== undefined)).toEqual([]);
  });

  test.each([
    ['the book of Jude', { book: 'Jude' }],
    ['the Gospel of John', { book: 'John' }],
    ['the gospel according to Matthew', { book: 'Matt' }],
    ['in First Corinthians', { book: '1Cor' }],
    ['in Ecclesiastes, the preacher', { book: 'Eccl' }],
    ['as the Psalms say', { book: 'Ps' }],
    ['when you read Galatians', { book: 'Gal' }],
  ])('names the book in %s', (text, ref) => {
    expect(refs(text).map((r) => r.ref)).toEqual([ref]);
  });

  test.each([
    'Paul wrote to the Romans',
    'the Galatians were foolish',
    'John said',
  ])('does not name a book in %s', (text) => {
    expect(refs(text)).toEqual([]);
  });

  test('a citation after "the book of" is a citation', () => {
    expect(refs('the book of Romans 8').map((r) => r.ref)).toEqual([
      { book: 'Rom', chapter: 8 },
    ]);
  });
});
