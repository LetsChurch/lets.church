import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchRequestHandler } = vi.hoisted(() => ({
  fetchRequestHandler: vi.fn(),
}));

vi.mock('@trpc/server/adapters/fetch', () => ({ fetchRequestHandler }));
vi.mock('@/trpc/context', () => ({ createContext: vi.fn() }));
vi.mock('@/trpc/router', () => ({ appRouter: {} }));

import { BIBLE_TRPC_MAX_BODY_BYTES, Route } from './trpc.$';

type RouteHandler = (context: { request: Request }) => Promise<Response>;
type RouteHandlers = { GET: RouteHandler; POST: RouteHandler };

function handlers(): RouteHandlers {
  const options = Route.options as {
    server: { handlers: RouteHandlers };
  };
  return options.server.handlers;
}

function declaredRequest(body: string, contentLength: number): Request {
  return new Request('https://example.com/trpc/example', {
    method: 'POST',
    headers: {
      'content-length': String(contentLength),
      'content-type': 'application/json',
    },
    body,
  });
}

function streamedRequest(body: string): Request {
  const encoded = new TextEncoder().encode(body);
  const midpoint = Math.floor(encoded.byteLength / 2);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded.slice(0, midpoint));
      controller.enqueue(encoded.slice(midpoint));
      controller.close();
    },
  });

  return new Request('https://example.com/trpc/example', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

beforeEach(() => {
  fetchRequestHandler
    .mockReset()
    .mockResolvedValue(new Response(null, { status: 204 }));
});

describe('lets.bible tRPC body boundary', () => {
  it('leaves GET requests untouched', async () => {
    const request = new Request('https://example.com/trpc/example');

    await handlers().GET({ request });

    expect(fetchRequestHandler).toHaveBeenCalledWith(
      expect.objectContaining({ req: request }),
    );
  });

  it.each([
    ['single', 'https://example.com/trpc/example', '{"json":{"book":"John"}}'],
    [
      'batch',
      'https://example.com/trpc/first,second?batch=1',
      '{"0":{"json":{"book":"John"}},"1":{"json":{"book":"Ps"}}}',
    ],
  ])(
    'reconstructs an allowed %s POST for the adapter',
    async (_name, url, body) => {
      const request = new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });

      const response = await handlers().POST({ request });

      expect(response.status).toBe(204);
      expect(fetchRequestHandler).toHaveBeenCalledOnce();
      const adapterRequest = fetchRequestHandler.mock.calls[0]?.[0]
        .req as Request;
      expect(adapterRequest.url).toBe(url);
      expect(adapterRequest.headers.get('content-length')).toBe(
        String(new TextEncoder().encode(body).byteLength),
      );
      await expect(adapterRequest.text()).resolves.toBe(body);
    },
  );

  it('accepts a declared length exactly at the ceiling', async () => {
    const response = await handlers().POST({
      request: declaredRequest('{}', BIBLE_TRPC_MAX_BODY_BYTES),
    });

    expect(response.status).toBe(204);
    expect(fetchRequestHandler).toHaveBeenCalledOnce();
  });

  it.each([
    ['declared', () => declaredRequest('{}', BIBLE_TRPC_MAX_BODY_BYTES + 1)],
    [
      'streamed',
      () => streamedRequest('x'.repeat(BIBLE_TRPC_MAX_BODY_BYTES + 1)),
    ],
  ])(
    'rejects %s overflow before invoking the adapter',
    async (_name, makeRequest) => {
      const response = await handlers().POST({ request: makeRequest() });

      expect(response.status).toBe(413);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(fetchRequestHandler).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['malformed JSON', '{'],
    ['an empty body', ''],
  ])('delegates %s to the tRPC adapter', async (_name, body) => {
    fetchRequestHandler.mockResolvedValueOnce(
      Response.json({ error: { message: 'Bad Request' } }, { status: 400 }),
    );

    const response = await handlers().POST({
      request: new Request('https://example.com/trpc/example', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }),
    });

    expect(response.status).toBe(400);
    expect(fetchRequestHandler).toHaveBeenCalledOnce();
  });
});
