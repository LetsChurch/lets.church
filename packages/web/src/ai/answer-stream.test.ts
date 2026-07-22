import { describe, expect, it } from 'vitest';

import {
  type AnswerSource,
  answerSourceKey,
  channelChunk,
  parseAnswerStream,
  SOURCES_DELIMITER,
  terminalChunk,
} from './answer-stream';

function source(startSeconds: number): AnswerSource {
  return {
    id: 'AbC123',
    title: 'One sermon, several cited moments',
    channelName: 'Test Channel',
    avatarUrl: null,
    thumbnailUrl: null,
    startSeconds,
  };
}

describe('parseAnswerStream', () => {
  it('keeps distinct timestamps from the same upload', () => {
    const first = source(12);
    const second = source(98);
    const raw =
      `[]${SOURCES_DELIMITER}` +
      channelChunk('s', JSON.stringify([first, second, first])) +
      channelChunk(
        'a',
        'The opening matters [upload:AbC123@12], as does the response [upload:AbC123@98].',
      ) +
      terminalChunk({ status: 'done' });

    const parsed = parseAnswerStream(raw);

    expect(parsed.sources.map(answerSourceKey)).toEqual([
      'AbC123@12',
      'AbC123@98',
    ]);
    expect(parsed.answer).toContain('[upload:AbC123@98]');
    expect(parsed.terminal).toEqual({ status: 'done' });
  });

  it('waits for a complete terminal frame', () => {
    const complete =
      `[]${SOURCES_DELIMITER}` +
      channelChunk('a', 'Complete answer.') +
      terminalChunk({ status: 'error', reason: 'timeout' });

    expect(parseAnswerStream(complete.slice(0, -2)).terminal).toBeNull();
    expect(parseAnswerStream(complete).terminal).toEqual({
      status: 'error',
      reason: 'timeout',
    });
  });

  it('continues to parse legacy plain answer streams', () => {
    expect(parseAnswerStream(`[]${SOURCES_DELIMITER}A plain answer.`)).toEqual({
      answer: 'A plain answer.',
      reasoning: '',
      sources: [],
      terminal: null,
    });
  });

  it('hides a trailing partial upload citation while streaming', () => {
    const parsed = parseAnswerStream(
      `[]${SOURCES_DELIMITER}${channelChunk('a', 'Answer [upload:AbC')}`,
    );

    expect(parsed.answer).toBe('Answer');
  });
});
