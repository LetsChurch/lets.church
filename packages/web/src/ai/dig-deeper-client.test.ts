import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnswerStreamEvent } from '@/trpc/answer-relay';

import {
  channelChunk,
  SOURCES_DELIMITER,
  terminalChunk,
} from './answer-stream';
import {
  DigDeeperRateLimitError,
  readDigDeeperTurn,
  requestDigDeeperTurn,
} from './dig-deeper-client';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@/trpc/react', () => ({
  trpcClient: { search: { digDeeper: { mutate } } },
}));

beforeEach(() => {
  mutate.mockReset();
});

// Emit `raw` as text events of `chunkSize` characters, like the relayed stream.
async function* textEvents(
  raw: string,
  chunkSize = 1,
): AsyncGenerator<AnswerStreamEvent> {
  for (let i = 0; i < raw.length; i += chunkSize) {
    yield { type: 'text', text: raw.slice(i, i + chunkSize) };
  }
}

describe('readDigDeeperTurn', () => {
  it('accumulates text events and requires a done terminal', async () => {
    const raw =
      `[]${SOURCES_DELIMITER}` +
      channelChunk('a', 'Clementine’s answer is grounded.') +
      terminalChunk({ status: 'done' });
    const onText = vi.fn();

    await expect(readDigDeeperTurn(textEvents(raw), onText)).resolves.toEqual({
      status: 'done',
    });
    expect(onText).toHaveBeenLastCalledWith(raw);
  });

  it('treats a stream without a terminal as a stream error', async () => {
    const raw = `[]${SOURCES_DELIMITER}${channelChunk('a', 'Partial answer.')}`;

    await expect(
      readDigDeeperTurn(textEvents(raw, 8), vi.fn()),
    ).resolves.toEqual({ status: 'error', reason: 'stream-error' });
  });

  it('returns an explicit server error terminal', async () => {
    const raw =
      `[]${SOURCES_DELIMITER}` +
      channelChunk('a', 'Partial answer.') +
      terminalChunk({ status: 'error', reason: 'timeout' });

    await expect(
      readDigDeeperTurn(textEvents(raw, 5), vi.fn()),
    ).resolves.toEqual({ status: 'error', reason: 'timeout' });
  });

  it('surfaces rate limits with the server retry delay', async () => {
    async function* limited(): AsyncGenerator<AnswerStreamEvent> {
      yield { type: 'rate-limited', retryAfterSeconds: 23 };
    }

    const error = await readDigDeeperTurn(limited(), vi.fn()).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(DigDeeperRateLimitError);
    expect(error).toMatchObject({ retryAfterSeconds: 23 });
  });
});

describe('requestDigDeeperTurn', () => {
  it('calls the streaming procedure and passes cancellation through', async () => {
    const raw = `[]${SOURCES_DELIMITER}` + terminalChunk({ status: 'done' });
    mutate.mockResolvedValue(textEvents(raw));
    const controller = new AbortController();

    await expect(
      requestDigDeeperTurn({
        messages: [{ role: 'user', content: 'Question' }],
        threadId: 'thread',
        resourceId: 'resource',
        signal: controller.signal,
        onText: vi.fn(),
      }),
    ).resolves.toEqual({ status: 'done' });
    expect(mutate).toHaveBeenCalledWith(
      {
        messages: [{ role: 'user', content: 'Question' }],
        threadId: 'thread',
        resourceId: 'resource',
      },
      { signal: controller.signal },
    );
  });
});
