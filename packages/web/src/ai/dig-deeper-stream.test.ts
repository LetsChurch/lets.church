import { describe, expect, it } from 'vitest';

import {
  finishDigDeeperStream,
  publicDigDeeperChunk,
} from './dig-deeper-stream';

describe('publicDigDeeperChunk', () => {
  it('publishes allowlisted tool progress', () => {
    expect(
      publicDigDeeperChunk({
        type: 'tool-call',
        toolName: 'searchMedia',
        input: { query: 'infant baptism' },
      }),
    ).toEqual({
      kind: 'chunk',
      channel: 'r',
      text: 'Searching the library for “infant baptism”…\n',
    });
  });

  it('never publishes raw provider reasoning', () => {
    expect(
      publicDigDeeperChunk({
        type: 'reasoning-delta',
        text: 'private model deliberation',
      }),
    ).toBeNull();
  });

  it('passes answer text and surfaces provider errors to the state machine', () => {
    expect(
      publicDigDeeperChunk({ type: 'text-delta', text: 'Grounded answer.' }),
    ).toEqual({ kind: 'chunk', channel: 'a', text: 'Grounded answer.' });
    expect(publicDigDeeperChunk({ type: 'error', error: 'failed' })).toEqual({
      kind: 'error',
      error: 'failed',
    });
  });
});

describe('finishDigDeeperStream', () => {
  it('only marks a non-empty, normally stopped answer done', () => {
    expect(
      finishDigDeeperStream({
        answerText: 'Grounded answer.',
        failure: null,
        finishReason: 'stop',
      }),
    ).toEqual({ status: 'done' });
  });

  it.each([
    ['timeout', 'timeout'],
    ['stream-error', 'stream-error'],
    ['provider-error', 'provider-error'],
  ] as const)('marks a %s failure as an error terminal', (_label, failure) => {
    expect(
      finishDigDeeperStream({
        answerText: 'Partial answer.',
        failure,
        finishReason: null,
      }),
    ).toEqual({ status: 'error', reason: failure });
  });

  it('marks length finishes as truncated instead of successful', () => {
    expect(
      finishDigDeeperStream({
        answerText: 'Partial answer.',
        failure: null,
        finishReason: 'length',
      }),
    ).toEqual({ status: 'error', reason: 'truncated' });
  });

  it('marks an empty normal finish as an error', () => {
    expect(
      finishDigDeeperStream({
        answerText: '   ',
        failure: null,
        finishReason: 'stop',
      }),
    ).toEqual({ status: 'error', reason: 'empty-answer' });
  });

  it('preserves cancellation as a distinct terminal state', () => {
    expect(
      finishDigDeeperStream({
        answerText: '',
        failure: 'cancelled',
        finishReason: null,
      }),
    ).toEqual({ status: 'cancelled', reason: 'cancelled' });
  });
});
