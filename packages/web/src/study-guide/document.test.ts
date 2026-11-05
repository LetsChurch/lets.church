import { describe, expect, it } from 'vitest';

import { groupRefs } from './document';

describe('groupRefs', () => {
  it('names a book once for consecutive references to it', () => {
    expect(
      groupRefs([
        { book: 'Job', chapter: 9, verse: 2 },
        { book: '2Tim', chapter: 1, verse: 5 },
        { book: '2Tim', chapter: 3, verse: 14, endVerse: 17 },
        { book: 'Jude', chapter: 1, verse: 3 },
        { book: 'Rom', chapter: 1 },
      ]),
    ).toBe('Job 9:2  ·  2 Timothy 1:5; 3:14-17  ·  Jude 3  ·  Romans 1');
  });

  it('prints chapter ranges as ranges', () => {
    expect(
      groupRefs([
        { book: 'Rom', chapter: 1, endChapter: 3 },
        { book: 'Rom', chapter: 5, endChapter: 6 },
      ]),
    ).toBe('Romans 1-3; 5-6');
  });
});
