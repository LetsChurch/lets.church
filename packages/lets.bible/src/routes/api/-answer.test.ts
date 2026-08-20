import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  cacheGet,
  cacheSet,
  classifyScriptureAnswerable,
  enforceAnswerRateLimit,
  expensiveModelImport,
  hybridSearchVerses,
  recollectionGate,
  streamText,
} = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  classifyScriptureAnswerable: vi.fn(),
  enforceAnswerRateLimit: vi.fn(),
  expensiveModelImport: vi.fn(),
  hybridSearchVerses: vi.fn(),
  recollectionGate: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@/util/rate-limit', () => ({
  answerRateLimitResponse: (decision: { retryAfterSeconds: number }) =>
    new Response('limited', {
      status: 429,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': String(decision.retryAfterSeconds),
      },
    }),
  enforceAnswerRateLimit,
}));
vi.mock('@/ai/model', () => {
  expensiveModelImport();
  return { ANSWER_MODEL: 'test', answerModel: {} };
});
vi.mock('@/search/search', () => ({ hybridSearchVerses }));
vi.mock('ai', () => ({ isStepCount: vi.fn(), streamText }));
vi.mock('@/util/cache', () => ({ cacheGet, cacheSet }));
vi.mock('@/ai/gate', () => ({
  classifyScriptureAnswerable,
  classifyVerseRecollection: vi.fn(),
  recollectionGate,
}));
vi.mock('@/ai/agent', () => ({
  detectiveTools: {},
  INSTRUCTIONS: 'test instructions',
  VERSE_DETECTIVE_INSTRUCTIONS: 'test detective instructions',
}));
vi.mock('@/ai/answer-stream', () => ({
  channelChunk: (channel: string, content: string) =>
    `\\u001e${channel}${content}`,
}));

import { ANSWER_MAX_BODY_BYTES, Route } from './answer';

type PostHandler = (context: { request: Request }) => Promise<Response>;

function postHandler(): PostHandler {
  const options = Route.options as unknown as {
    server: { handlers: { POST: PostHandler } };
  };
  return options.server.handlers.POST;
}

function streamedRequest(body: string): Request {
  const encoded = new TextEncoder().encode(body);
  const split = Math.floor(encoded.byteLength / 2);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded.slice(0, split));
      controller.enqueue(encoded.slice(split));
      controller.close();
    },
  });
  return new Request('https://example.com/api/answer', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

beforeEach(() => {
  cacheGet.mockReset().mockResolvedValue(null);
  cacheSet.mockReset().mockResolvedValue(undefined);
  classifyScriptureAnswerable.mockReset().mockResolvedValue(true);
  enforceAnswerRateLimit.mockReset().mockResolvedValue({ allowed: true });
  expensiveModelImport.mockClear();
  hybridSearchVerses
    .mockReset()
    .mockResolvedValue([
      { name: 'Ephesians', chapter: 2, verse: 8, text: 'By grace...' },
    ]);
  recollectionGate.mockReset().mockReturnValue('answer');
  streamText.mockReset();
});

describe('answer request boundary', () => {
  it('rejects declared overflow before rate limiting or AI imports', async () => {
    const response = await postHandler()({
      request: new Request('https://example.com/api/answer', {
        method: 'POST',
        headers: { 'content-length': String(ANSWER_MAX_BODY_BYTES + 1) },
        body: JSON.stringify({ q: 'grace', translation: 'BSB' }),
      }),
    });

    expect(response.status).toBe(413);
    expect(enforceAnswerRateLimit).not.toHaveBeenCalled();
    expect(expensiveModelImport).not.toHaveBeenCalled();
  });

  it('rejects streamed overflow before rate limiting or AI imports', async () => {
    const response = await postHandler()({
      request: streamedRequest(
        JSON.stringify({
          q: 'grace',
          translation: 'BSB',
          padding: 'x'.repeat(ANSWER_MAX_BODY_BYTES),
        }),
      ),
    });

    expect(response.status).toBe(413);
    expect(enforceAnswerRateLimit).not.toHaveBeenCalled();
    expect(expensiveModelImport).not.toHaveBeenCalled();
  });

  it('preserves malformed under-limit JSON as 400', async () => {
    const response = await postHandler()({
      request: new Request('https://example.com/api/answer', {
        method: 'POST',
        body: '{',
      }),
    });

    expect(response.status).toBe(400);
    expect(enforceAnswerRateLimit).not.toHaveBeenCalled();
  });

  it('rejects before cache, retrieval, or model imports', async () => {
    enforceAnswerRateLimit.mockResolvedValueOnce({
      allowed: false,
      limitedBy: 'resource',
      retryAfterSeconds: 13,
    });
    const response = await postHandler()({
      request: new Request('https://example.com/api/answer', {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '203.0.113.9' },
        body: JSON.stringify({ q: 'grace', translation: 'BSB' }),
      }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('13');
    expect(response.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(expensiveModelImport).not.toHaveBeenCalled();
  });

  it('preserves the cached response shape for an allowed request', async () => {
    cacheGet.mockResolvedValueOnce(
      JSON.stringify({ answer: 'Cached answer', reasoning: null }),
    );
    const response = await postHandler()({
      request: new Request('https://example.com/api/answer', {
        method: 'POST',
        body: JSON.stringify({ q: 'grace', translation: 'BSB' }),
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('Cached answer');
    expect(streamText).not.toHaveBeenCalled();
  });

  it('preserves the uncached streaming response shape for an allowed request', async () => {
    streamText.mockReturnValueOnce({
      textStream: (async function* () {
        yield 'Faith';
        yield ' answer';
      })(),
    });
    const response = await postHandler()({
      request: new Request('https://example.com/api/answer', {
        method: 'POST',
        body: JSON.stringify({ q: 'grace', translation: 'BSB' }),
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('Faith answer');
    expect(cacheSet).toHaveBeenCalledWith(
      expect.stringContaining('letsbible-answer:v2:test:'),
      JSON.stringify({ answer: 'Faith answer', reasoning: null }),
      86_400,
    );
  });
});
