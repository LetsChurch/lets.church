import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  channelChunk,
  SOURCES_DELIMITER,
  terminalChunk,
} from './answer-stream';
import { requestDigDeeperTurn } from './dig-deeper-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

function chunkedResponse(text: string, chunkSize = 1): Response {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += chunkSize) {
          controller.enqueue(bytes.slice(i, i + chunkSize));
        }
        controller.close();
      },
    }),
  );
}

function run(onText = vi.fn()) {
  return requestDigDeeperTurn({
    messages: [{ role: 'user', content: 'Who is Clementine?' }],
    threadId: 'thread',
    resourceId: 'resource',
    signal: new AbortController().signal,
    onText,
  });
}

describe('requestDigDeeperTurn', () => {
  it('decodes arbitrary byte boundaries and requires a done terminal', async () => {
    const raw =
      `[]${SOURCES_DELIMITER}` +
      channelChunk('a', 'Clementine’s answer is grounded.') +
      terminalChunk({ status: 'done' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => chunkedResponse(raw)),
    );
    const onText = vi.fn();

    await expect(run(onText)).resolves.toEqual({ status: 'done' });
    expect(onText).toHaveBeenLastCalledWith(raw);
  });

  it('treats a bare EOF as a stream error', async () => {
    const raw = `[]${SOURCES_DELIMITER}${channelChunk('a', 'Partial answer.')}`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => chunkedResponse(raw, 8)),
    );

    await expect(run()).resolves.toEqual({
      status: 'error',
      reason: 'stream-error',
    });
  });

  it('returns an explicit server error terminal', async () => {
    const raw =
      `[]${SOURCES_DELIMITER}` +
      channelChunk('a', 'Partial answer.') +
      terminalChunk({ status: 'error', reason: 'timeout' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => chunkedResponse(raw, 5)),
    );

    await expect(run()).resolves.toEqual({
      status: 'error',
      reason: 'timeout',
    });
  });

  it('passes cancellation through to fetch', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      ),
    );

    const pending = requestDigDeeperTurn({
      messages: [{ role: 'user', content: 'Question' }],
      threadId: 'thread',
      resourceId: 'resource',
      signal: controller.signal,
      onText: vi.fn(),
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
