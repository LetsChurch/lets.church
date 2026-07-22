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
    });
  });

  it('rejects incomplete or unrelated history state', () => {
    expect(digDeeperSeedFromHistoryState({ __TSR_index: 1 })).toBeUndefined();
    expect(
      parseDigDeeperSeed({ question: 'Question', raw: '' }),
    ).toBeUndefined();
    expect(parseDigDeeperSeed({ question: '', raw: 'answer' })).toBeUndefined();
  });
});
