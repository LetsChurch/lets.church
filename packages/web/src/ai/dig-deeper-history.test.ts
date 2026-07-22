import { describe, expect, it } from 'vitest';

import {
  channelChunk,
  SOURCES_DELIMITER,
  terminalChunk,
} from './answer-stream';
import {
  buildDigDeeperMessages,
  DIG_DEEPER_MAX_MESSAGES,
  type DigDeeperHistoryTurn,
} from './dig-deeper-history';

const completedTurn = (index: number): DigDeeperHistoryTurn => ({
  question: `Question ${index}`,
  raw: `[]${SOURCES_DELIMITER}Answer ${index}`,
  status: 'done',
});

describe('buildDigDeeperMessages', () => {
  it('does not treat a failed partial answer as conversation history', () => {
    const partial =
      `[]${SOURCES_DELIMITER}` +
      channelChunk('a', 'Incomplete, rejected answer.') +
      terminalChunk({ status: 'error', reason: 'timeout' });

    expect(
      buildDigDeeperMessages(
        [
          {
            question: 'The request that failed',
            raw: partial,
            status: 'error',
          },
        ],
        'Try another approach',
      ),
    ).toEqual([
      { role: 'user', content: 'The request that failed' },
      { role: 'user', content: 'Try another approach' },
    ]);
  });

  it('drops the oldest whole exchanges before reaching the API limit', () => {
    const messages = buildDigDeeperMessages(
      Array.from({ length: 20 }, (_, i) => completedTurn(i + 1)),
      'Question 21',
    );

    expect(messages).toHaveLength(39);
    expect(messages.length).toBeLessThanOrEqual(DIG_DEEPER_MAX_MESSAGES);
    expect(messages.slice(0, 2)).toEqual([
      { role: 'user', content: 'Question 2' },
      { role: 'assistant', content: 'Answer 2' },
    ]);
    expect(messages.at(-1)).toEqual({
      role: 'user',
      content: 'Question 21',
    });
  });

  it('can use all remaining slots for user-only failed turns', () => {
    const failedTurns: DigDeeperHistoryTurn[] = Array.from(
      { length: DIG_DEEPER_MAX_MESSAGES - 1 },
      (_, i) => ({
        question: `Failed question ${i + 1}`,
        raw: '',
        status: 'error',
      }),
    );

    expect(
      buildDigDeeperMessages(failedTurns, 'Current question'),
    ).toHaveLength(DIG_DEEPER_MAX_MESSAGES);
  });
});
