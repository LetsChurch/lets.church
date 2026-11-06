import { describe, expect, it } from 'vitest';

import { fitStep } from './document';
import { args, long } from './long-guide.fixture';
import { pageCount, renderStudyGuidePdf } from './render.server';

describe('renderStudyGuidePdf', () => {
  it('fits a long guide on two pages', async () => {
    const pdf = await renderStudyGuidePdf({ content: long, ...args });
    expect(pageCount(pdf)).toBe(2);
  }, 30_000);
});

describe('fitStep', () => {
  it('tries both places for Pray before each further trim', () => {
    expect(fitStep(long, 0)).toEqual({ content: long, prayLeft: false });
    expect(fitStep(long, 1)).toEqual({ content: long, prayLeft: true });
    expect(fitStep(long, 2)).toEqual({
      content: { ...long, timeline: null },
      prayLeft: false,
    });
    expect(fitStep(long, 4)?.content.memoryVerse).toEqual({
      ...long.memoryVerse,
      ref: { book: 'Rom', chapter: 3, verse: 24 },
      verses: long.memoryVerse?.verses.slice(0, 1),
    });
    expect(fitStep(long, 7)?.content.keyTerms).toHaveLength(4);
    expect(fitStep(long, 8)?.content.family).toBeNull();
    expect(fitStep(long, 11)?.content.quotes).toHaveLength(1);
    expect(fitStep(long, 12)).toBeNull();
  });
});
