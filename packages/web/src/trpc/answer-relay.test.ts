import { describe, expect, it } from 'vitest';

import { type AnswerStreamEvent, relayAnswer } from './answer-relay';

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

async function collect(response: Response): Promise<AnswerStreamEvent[]> {
  const events: AnswerStreamEvent[] = [];
  for await (const event of relayAnswer(response)) events.push(event);
  return events;
}

describe('relayAnswer', () => {
  it('decodes multi-byte characters split across chunks', async () => {
    const text = 'Clementine’s answer — grounded ✓';
    const events = await collect(chunkedResponse(text, 1));

    expect(events.every((e) => e.type === 'text')).toBe(true);
    expect(events.map((e) => (e.type === 'text' ? e.text : '')).join('')).toBe(
      text,
    );
  });

  it('turns a 429 into a single rate-limited event', async () => {
    const events = await collect(
      new Response('Slow down', {
        status: 429,
        headers: { 'Retry-After': '12' },
      }),
    );

    expect(events).toEqual([{ type: 'rate-limited', retryAfterSeconds: 12 }]);
  });

  it('defaults a missing Retry-After', async () => {
    await expect(
      collect(new Response('Slow down', { status: 429 })),
    ).resolves.toEqual([{ type: 'rate-limited', retryAfterSeconds: 10 }]);
  });

  it('maps a 400 to BAD_REQUEST and other failures to a generic error', async () => {
    await expect(
      collect(
        new Response('Last message must be from the user', { status: 400 }),
      ),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Last message must be from the user',
    });
    await expect(
      collect(new Response('internal detail', { status: 500 })),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to generate answer',
    });
  });
});
