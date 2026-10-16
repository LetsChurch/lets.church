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

  it('carries the saved answer id on a done terminal', () => {
    const answerId = '0f8e2b1c-3d4a-4b5c-8d6e-7f8091a2b3c4';
    const raw =
      `[]${SOURCES_DELIMITER}` +
      channelChunk('a', 'Answer.') +
      terminalChunk({ status: 'done', answerId });

    expect(parseAnswerStream(raw).terminal).toEqual({
      status: 'done',
      answerId,
    });
  });

  it('rejects a done terminal whose answer id is not a uuid', () => {
    const raw =
      `[]${SOURCES_DELIMITER}` +
      channelChunk('a', 'Answer.') +
      channelChunk('t', JSON.stringify({ status: 'done', answerId: '../x' }));

    expect(parseAnswerStream(raw).terminal).toBeNull();
  });

  it('reads a plain answer followed by a terminal frame', () => {
    const answerId = '0f8e2b1c-3d4a-4b5c-8d6e-7f8091a2b3c4';
    const parsed = parseAnswerStream(
      `[]${SOURCES_DELIMITER}A plain answer [upload:AbC123@12].` +
        terminalChunk({ status: 'done', answerId }),
    );

    expect(parsed.answer).toBe('A plain answer [upload:AbC123@12].');
    expect(parsed.reasoning).toBe('');
    expect(parsed.terminal).toEqual({ status: 'done', answerId });
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
