import { describe, expect, it } from 'vitest';

import {
  digDeeperSeedFromHistoryState,
  parseDigDeeperSeed,
} from './dig-deeper-seed';

describe('Dig Deeper overview handoff', () => {
  it('reads a settled overview snapshot from router history state', () => {
    expect(
      digDeeperSeedFromHistoryState({
        __TSR_index: 1,
        digDeeperSeed: {
          question: 'What is covenant theology?',
          raw: '[]\u001eA cited overview.',
        },
      }),
    ).toEqual({
      question: 'What is covenant theology?',
      raw: '[]\u001eA cited overview.',
      rating: null,
    });
  });

  it('carries a valid overview rating and drops anything else', () => {
    const seed = (rating: unknown) =>
      parseDigDeeperSeed({ question: 'Question', raw: 'answer', rating });

    expect(seed('LIKE')?.rating).toBe('LIKE');
    expect(seed('DISLIKE')?.rating).toBe('DISLIKE');
    expect(seed('SUPER')?.rating).toBeNull();
    expect(seed(undefined)?.rating).toBeNull();
  });

  it('rejects incomplete or unrelated history state', () => {
    expect(digDeeperSeedFromHistoryState({ __TSR_index: 1 })).toBeUndefined();
    expect(
      parseDigDeeperSeed({ question: 'Question', raw: '' }),
    ).toBeUndefined();
    expect(parseDigDeeperSeed({ question: '', raw: 'answer' })).toBeUndefined();
  });
});
