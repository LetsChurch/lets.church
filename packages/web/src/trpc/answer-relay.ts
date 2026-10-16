import { TRPCError } from '@trpc/server';

/**
 * What the streaming AI procedures yield. `text` chunks concatenate into the
 * answer wire format parsed by `parseAnswerStream` (ai/answer-stream.ts);
 * `rate-limited` is the only item when the shared AI limiter refuses the call.
 */
export type AnswerStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'rate-limited'; retryAfterSeconds: number };

/**
 * Relay a streamed answer Response as procedure output. The answer modules
 * build plain Responses (status + streamed body); this maps them onto tRPC: 429
 * → a `rate-limited` item, 400 → BAD_REQUEST, other failures → a generic
 * INTERNAL_SERVER_ERROR, and a body → its decoded text chunks. When the client
 * aborts, tRPC returns the generator; `finally` cancels the body so the
 * generation stops too.
 */
export async function* relayAnswer(
  response: Response,
): AsyncGenerator<AnswerStreamEvent> {
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After'));
    yield {
      type: 'rate-limited',
      retryAfterSeconds:
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.ceil(retryAfter)
          : 10,
    };
    return;
  }
  if (response.status === 400) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: await response.text(),
    });
  }
  if (!response.ok || !response.body) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to generate answer',
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) yield { type: 'text', text };
    }
    finished = true;
    const rest = decoder.decode();
    if (rest) yield { type: 'text', text: rest };
  } finally {
    if (!finished) void reader.cancel();
  }
}
