import { beforeEach, describe, expect, it, vi } from 'vitest';

const { enforceAiRateLimit, unwrapMuxWebhook } = vi.hoisted(() => ({
  enforceAiRateLimit: vi.fn(),
  unwrapMuxWebhook: vi.fn(),
}));

vi.mock('@/ai/abuse-control', () => ({
  aiRateLimitResponse: () => new Response('limited', { status: 429 }),
  enforceAiRateLimit,
}));
vi.mock('@/util/logger', () => ({
  default: {
    child: () => ({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));
vi.mock('@/util/mux', () => ({
  getMux: () => ({ webhooks: { unwrap: unwrapMuxWebhook } }),
  getMuxWebhookSecret: () => 'test-secret',
}));
vi.mock('@/temporal', () => ({
  signalMuxRenditionReady: vi.fn(),
  startMuxImportRecording: vi.fn(),
}));
vi.mock('@letschurch/db', () => ({
  ChannelLiveStream: {},
  ChannelSimulcastTarget: {},
  UploadListEntry: {},
  UploadRecord: {},
  db: {},
}));

import {
  DIG_DEEPER_MAX_BODY_BYTES,
  Route as DigDeeperRoute,
} from './api/dig-deeper';
import {
  Route as SearchAnswerRoute,
  SEARCH_ANSWER_MAX_BODY_BYTES,
} from './api/search-answer';
import { MUX_WEBHOOK_MAX_BODY_BYTES, Route as MuxRoute } from './webhooks_/mux';
type PostHandler = (context: { request: Request }) => Promise<Response>;

function postHandler(route: { options: unknown }): PostHandler {
  const options = route.options as {
    server: { handlers: { POST: PostHandler } };
  };
  return options.server.handlers.POST;
}

function declaredOverflowRequest(body: string, limit: number): Request {
  return new Request('https://example.com', {
    method: 'POST',
    headers: { 'content-length': String(limit + 1) },
    body,
  });
}

function streamedOverflowRequest(body: string): Request {
  const encoded = new TextEncoder().encode(body);
  const midpoint = Math.floor(encoded.byteLength / 2);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded.slice(0, midpoint));
      controller.enqueue(encoded.slice(midpoint));
      controller.close();
    },
  });
  return new Request('https://example.com', {
    method: 'POST',
    body: stream,
    // Required by Node's fetch implementation for a streaming request body.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

const validSearchBody = JSON.stringify({
  query: 'grace',
  threadId: 'thread',
  resourceId: 'browser',
});
const validDigBody = JSON.stringify({
  messages: [{ role: 'user', content: 'Tell me more' }],
  threadId: 'thread',
  resourceId: 'browser',
});

beforeEach(() => {
  enforceAiRateLimit.mockReset().mockResolvedValue({
    allowed: false,
    limitedBy: 'resource',
    retryAfterSeconds: 10,
  });
  unwrapMuxWebhook.mockReset().mockResolvedValue({ type: 'ignored', data: {} });
});

describe('public route request body limits', () => {
  it.each([
    [
      'search answer',
      SearchAnswerRoute,
      validSearchBody,
      SEARCH_ANSWER_MAX_BODY_BYTES,
    ],
    ['dig deeper', DigDeeperRoute, validDigBody, DIG_DEEPER_MAX_BODY_BYTES],
  ] as const)(
    'rejects declared overflow before expensive work for %s',
    async (_name, route, body, limit) => {
      const response = await postHandler(route)({
        request: declaredOverflowRequest(body, limit),
      });

      expect(response.status).toBe(413);
      expect(enforceAiRateLimit).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'search answer',
      SearchAnswerRoute,
      validSearchBody,
      SEARCH_ANSWER_MAX_BODY_BYTES,
    ],
    ['dig deeper', DigDeeperRoute, validDigBody, DIG_DEEPER_MAX_BODY_BYTES],
  ] as const)(
    'rejects streamed overflow before expensive work for %s',
    async (_name, route, body, limit) => {
      const oversized =
        body.slice(0, -1) + `,"padding":"${'x'.repeat(limit)}"}`;
      const response = await postHandler(route)({
        request: streamedOverflowRequest(oversized),
      });

      expect(response.status).toBe(413);
      expect(enforceAiRateLimit).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['search answer', SearchAnswerRoute],
    ['dig deeper', DigDeeperRoute],
  ] as const)(
    'preserves malformed under-limit JSON as 400 for %s',
    async (_name, route) => {
      const response = await postHandler(route)({
        request: new Request('https://example.com', {
          method: 'POST',
          body: '{',
        }),
      });

      expect(response.status).toBe(400);
      expect(enforceAiRateLimit).not.toHaveBeenCalled();
    },
  );

  it('rejects declared Mux overflow before loading the signature verifier', async () => {
    const response = await postHandler(MuxRoute)({
      request: declaredOverflowRequest('{}', MUX_WEBHOOK_MAX_BODY_BYTES),
    });

    expect(response.status).toBe(413);
    expect(unwrapMuxWebhook).not.toHaveBeenCalled();
  });

  it('rejects streamed Mux overflow before loading the signature verifier', async () => {
    const body = JSON.stringify({
      padding: 'x'.repeat(MUX_WEBHOOK_MAX_BODY_BYTES),
    });
    const response = await postHandler(MuxRoute)({
      request: streamedOverflowRequest(body),
    });

    expect(response.status).toBe(413);
    expect(unwrapMuxWebhook).not.toHaveBeenCalled();
  });

  it('preserves Mux signature failures as 401', async () => {
    unwrapMuxWebhook.mockRejectedValueOnce(new Error('bad signature'));
    const response = await postHandler(MuxRoute)({
      request: new Request('https://example.com', {
        method: 'POST',
        body: '{}',
      }),
    });

    expect(response.status).toBe(401);
    expect(unwrapMuxWebhook).toHaveBeenCalledOnce();
  });
});
