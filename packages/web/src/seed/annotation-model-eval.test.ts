import { describe, expect, it } from 'vitest';

import {
  estimateListCost,
  getPublishedPrices,
  scoreAnnotations,
  type CatalogModel,
  type CorpusItem,
} from './annotation-model-eval';

const item: CorpusItem = {
  id: 'sermon',
  title: 'Sermon',
  description: null,
  channelName: 'Church',
  paragraphs: [
    {
      id: 'paragraph',
      order: 0,
      text: 'He said the Word became flesh and dwelt among us today.',
      words: 'He said the Word became flesh and dwelt among us today.'
        .split(' ')
        .map((word, index) => ({ word, start: index, end: index + 1 })),
    },
  ],
  goldCases: [
    {
      paragraphId: 'paragraph',
      paragraphOrder: 0,
      text: 'the Word became flesh and dwelt among us',
      ref: { book: 'John', chapter: 1, verse: 14 },
      type: 'attributed',
    },
  ],
};

const model: CatalogModel = {
  id: 'vendor/model',
  pricing: {
    prompt: '0.000002',
    completion: '0.000010',
    input_cache_read: '0.0000001',
    overrides: [
      {
        min_prompt_tokens: 100_000,
        prompt: '0.000004',
        completion: '0.000015',
      },
    ],
  },
};

describe('scoreAnnotations', () => {
  it('requires exact references and the configured selected-word overlap', () => {
    const matching = {
      paragraphId: 'paragraph',
      kind: 'BIBLE' as const,
      startWord: 2,
      endWord: 9,
      rawSpan: 'the Word became flesh and dwelt among us',
      metadata: { book: 'John', chapter: 1, verse: 14 },
    };

    expect(scoreAnnotations(item, [matching], 0.8).covered).toBe(1);
    expect(
      scoreAnnotations(item, [{ ...matching, endWord: 7 }], 0.8).covered,
    ).toBe(0);
    expect(
      scoreAnnotations(
        item,
        [{ ...matching, metadata: { book: 'John', chapter: 1, verse: 13 } }],
        0.8,
      ).covered,
    ).toBe(0);
  });
});

describe('catalog pricing', () => {
  it('uses the highest applicable prompt-token price tier', () => {
    expect(getPublishedPrices(model, 99_999)).toMatchObject({
      input: 0.000002,
      output: 0.00001,
    });
    expect(getPublishedPrices(model, 100_000)).toMatchObject({
      input: 0.000004,
      output: 0.000015,
    });
    expect(estimateListCost(model, 100_000, 10_000)).toBeCloseTo(0.55);
  });
});
