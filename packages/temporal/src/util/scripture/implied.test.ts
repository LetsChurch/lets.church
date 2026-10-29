import { describe, expect, test } from 'vitest';

import { findExplicitRefs } from './explicit';
import { findImpliedRefs, parseOsis, primaryPassage } from './implied';
import { tokenize } from './tokens';
import type { BibleRef } from './versification';

function implied(paragraphs: string[], primary: BibleRef | null = null) {
  const tokenized = paragraphs.map((text) => {
    const tokens = tokenize(text);
    return { tokens, explicit: findExplicitRefs(tokens) };
  });
  return findImpliedRefs(tokenized, primary).flatMap((found, p) =>
    found.map(({ start, end, ref }) => ({
      paragraph: p,
      span: tokenized[p]?.tokens
        .slice(start, end)
        .map((t) => t.raw)
        .join(' '),
      ref,
    })),
  );
}

describe('primaryPassage', () => {
  test.each([
    [
      'Honoring the Dishonorable - 1 Peter 2:18-25',
      { book: '1Pet', chapter: 2, verse: 18, endVerse: 25 },
    ],
    [
      'Book of Psalms - Psa. 44, vv. 9-16',
      { book: 'Ps', chapter: 44, verse: 9, endVerse: 16 },
    ],
    ['Hebrews 1 (2026)', { book: 'Heb', chapter: 1 }],
  ])('%s', (title, ref) => {
    expect(primaryPassage(title)).toEqual(ref);
  });

  test('falls back to the description', () => {
    expect(
      primaryPassage('Good Works Are Not Burdensome', 'Text: 1 John 5:3'),
    ).toEqual({
      book: '1John',
      chapter: 5,
      verse: 3,
    });
  });

  test('is null without a chapter', () => {
    expect(
      primaryPassage('Sola Scriptura', 'The first sermon in our series'),
    ).toBeNull();
  });
});

describe('parseOsis', () => {
  test('reads ranges across chapters', () => {
    expect(parseOsis('Heb.1.4-Heb.2.18')).toEqual({
      book: 'Heb',
      chapter: 1,
      verse: 4,
      endChapter: 2,
      endVerse: 18,
    });
  });
});

describe('findImpliedRefs', () => {
  test('continues the passage just cited', () => {
    expect(
      implied([
        'Turn to Acts 8.',
        'Look back at verse 18 and 19. Simon saw the Spirit.',
      ]),
    ).toEqual([
      {
        paragraph: 1,
        span: 'verse 18 and 19.',
        ref: { book: 'Acts', chapter: 8, verse: 18, endVerse: 19 },
      },
    ]);
  });

  test('resolves an outline of the book being preached', () => {
    expect(
      implied(
        [
          'Superior to Moses, chapter 3, 1 through 19. Then we come to 10 .19 and following.',
        ],
        { book: 'Heb', chapter: 1 },
      ).map((r) => r.ref),
    ).toEqual([
      { book: 'Heb', chapter: 3, verse: 1, endVerse: 19 },
      { book: 'Heb', chapter: 10, verse: 19 },
    ]);
  });

  test('returns to the primary passage after an aside goes stale', () => {
    const aside = `As Romans 3:23 says. ${'and so on '.repeat(200)}`;
    expect(
      implied([aside, 'Now in verse 21 Peter says'], {
        book: '1Pet',
        chapter: 2,
        verse: 18,
        endVerse: 25,
      }).map((r) => r.ref),
    ).toEqual([{ book: '1Pet', chapter: 2, verse: 21 }]);
  });

  test('a fresh aside wins over the primary passage', () => {
    expect(
      implied(['Romans 3:23 says it. And verse 24 continues'], {
        book: '1Pet',
        chapter: 2,
        verse: 18,
        endVerse: 25,
      }).map((r) => r.ref),
    ).toEqual([{ book: 'Rom', chapter: 3, verse: 24 }]);
  });

  test.each([
    'the third verse of the hymn, verse 3',
    'we went verse by verse',
    'in chapter 3 of his book on prayer',
    'the service at 10:30 on Sunday',
    'we meet 10:30 am',
    'Join us for the 9:30 service next week',
    'our 10:45 and 11:15 services',
    'see you Sunday 10:30',
  ])('ignores %s', (text) => {
    expect(implied([text], { book: 'Rom', chapter: 8 })).toEqual([]);
  });

  test('reads "verses 3 and 12" as two verses, not a range', () => {
    expect(
      implied(['Acts 8 says', 'see verses 3 and 12']).map((r) => r.ref),
    ).toEqual([{ book: 'Acts', chapter: 8, verse: 3 }]);
  });

  test('needs some context', () => {
    expect(implied(['and verse 17 says'])).toEqual([]);
  });
});
