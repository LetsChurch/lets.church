import { beforeEach, describe, expect, it, vi } from 'vitest';

const { unwrapMuxWebhook } = vi.hoisted(() => ({
  unwrapMuxWebhook: vi.fn(),
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

beforeEach(() => {
  unwrapMuxWebhook.mockReset().mockResolvedValue({ type: 'ignored', data: {} });
});

describe('public route request body limits', () => {
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
