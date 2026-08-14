import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  accessControlFilter,
  buildUserClaims,
  consumeAuthorizationCode,
  fetchRequestHandler,
  getClient,
  hydrateUploads,
  mintAccessToken,
  mintIdToken,
  osSearch,
  rotateRefreshToken,
} = vi.hoisted(() => ({
  accessControlFilter: vi.fn(),
  consumeAuthorizationCode: vi.fn(),
  buildUserClaims: vi.fn(),
  fetchRequestHandler: vi.fn(),
  getClient: vi.fn(),
  hydrateUploads: vi.fn(),
  mintAccessToken: vi.fn(),
  mintIdToken: vi.fn(),
  osSearch: vi.fn(),
  rotateRefreshToken: vi.fn(),
}));

vi.mock('@trpc/server/adapters/fetch', () => ({ fetchRequestHandler }));
vi.mock('@/trpc/context', () => ({ createContext: vi.fn() }));
vi.mock('@/trpc/router', () => ({ appRouter: {} }));
vi.mock('@/util/logger', () => ({
  default: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

vi.mock('@/util/oidc/claims', () => ({ buildUserClaims }));
vi.mock('@/util/oidc/clients', () => ({ getClient }));
vi.mock('@/util/oidc/config', () => ({ ACCESS_TOKEN_TTL_SECONDS: 3600 }));
vi.mock('@/util/oidc/pkce', () => ({ verifyPkceS256: vi.fn() }));
vi.mock('@/util/oidc/tokens', () => ({
  consumeAuthorizationCode,
  mintAccessToken,
  mintIdToken,
  mintRefreshToken: vi.fn(),
  rotateRefreshToken,
}));

vi.mock('@/util/bible-annotations', () => ({
  annotationCoversVerse: vi.fn(),
}));
vi.mock('@letschurch/opensearch', () => ({
  accessControlFilter,
  MEDIA_INDEX: 'media',
  osSearch,
}));
vi.mock('@/trpc/search/hydrate', () => ({ hydrateUploads }));
vi.mock('@letschurch/db', () => ({
  Annotation: {},
  TranscriptParagraph: {},
  db: {},
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}));
vi.mock('@/schemas/common', () => ({
  IncomingIdSchema: { parse: (value: unknown) => value },
}));

import {
  MEDIA_FOR_VERSE_MAX_BODY_BYTES,
  Route as MediaForVerseRoute,
} from './api/internal/media-for-verse';
import {
  OIDC_TOKEN_MAX_BODY_BYTES,
  Route as OidcTokenRoute,
} from './oidc.token';
import { Route as TrpcRoute, WEB_TRPC_MAX_BODY_BYTES } from './trpc.$';

type RouteHandler = (context: { request: Request }) => Promise<Response>;
type RouteHandlers = { GET?: RouteHandler; POST: RouteHandler };

function handlers(route: { options: unknown }): RouteHandlers {
  const options = route.options as { server: { handlers: RouteHandlers } };
  return options.server.handlers;
}

function requestWithDeclaredLength(
  body: string,
  declaredLength: number,
  url = 'https://example.com',
): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-length': String(declaredLength),
      'content-type': 'application/json',
    },
    body,
  });
}

function streamedRequest(body: string, url = 'https://example.com'): Request {
  const encoded = new TextEncoder().encode(body);
  const midpoint = Math.floor(encoded.byteLength / 2);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded.slice(0, midpoint));
      controller.enqueue(encoded.slice(midpoint));
      controller.close();
    },
  });

  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

function streamedByteCountRequest(byteCount: number): Request {
  const chunk = new Uint8Array(1024 * 1024);
  let remaining = byteCount;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (remaining === 0) {
        controller.close();
        return;
      }
      const size = Math.min(remaining, chunk.byteLength);
      controller.enqueue(chunk.subarray(0, size));
      remaining -= size;
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
  vi.stubEnv('WEB_URL', 'https://lets.church');
  fetchRequestHandler
    .mockReset()
    .mockResolvedValue(new Response(null, { status: 204 }));
  getClient.mockReset().mockReturnValue({ clientId: 'test-client' });
  consumeAuthorizationCode.mockReset();
  buildUserClaims.mockReset().mockResolvedValue({});
  mintAccessToken.mockReset().mockResolvedValue('access-token');
  mintIdToken.mockReset().mockResolvedValue('id-token');
  rotateRefreshToken.mockReset().mockResolvedValue({
    rotation: {
      ok: true,
      appUserId: 'user-id',
      scope: 'openid',
      authTime: 1,
    },
    newRefreshToken: 'new-refresh-token',
  });
  accessControlFilter
    .mockReset()
    .mockReturnValue([{ term: { access: 'PUBLIC' } }]);
  osSearch.mockReset().mockResolvedValue({ hits: { hits: [] } });
  hydrateUploads.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('web tRPC body boundary', () => {
  it('leaves GET requests untouched', async () => {
    const request = new Request('https://example.com/trpc/example');

    await handlers(TrpcRoute).GET?.({ request });

    expect(fetchRequestHandler).toHaveBeenCalledWith(
      expect.objectContaining({ req: request }),
    );
  });

  it.each([
    ['single', 'https://example.com/trpc/example', '{"json":{"id":"1"}}'],
    [
      'batch',
      'https://example.com/trpc/first,second?batch=1',
      '{"0":{"json":{"id":"1"}},"1":{"json":{"id":"2"}}}',
    ],
  ])(
    'reconstructs an allowed %s POST for the adapter',
    async (_name, url, body) => {
      const request = requestWithDeclaredLength(
        body,
        new TextEncoder().encode(body).byteLength,
        url,
      );

      const response = await handlers(TrpcRoute).POST({ request });

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
    const response = await handlers(TrpcRoute).POST({
      request: requestWithDeclaredLength('{}', WEB_TRPC_MAX_BODY_BYTES),
    });

    expect(response.status).toBe(204);
    expect(fetchRequestHandler).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'declared',
      () => requestWithDeclaredLength('{}', WEB_TRPC_MAX_BODY_BYTES + 1),
    ],
    ['streamed', () => streamedByteCountRequest(WEB_TRPC_MAX_BODY_BYTES + 1)],
  ])(
    'rejects %s overflow before invoking the adapter',
    async (_name, makeRequest) => {
      const response = await handlers(TrpcRoute).POST({
        request: makeRequest(),
      });

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

    const response = await handlers(TrpcRoute).POST({
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

describe('OIDC token body boundary', () => {
  it.each([
    [
      'declared',
      () => requestWithDeclaredLength('', OIDC_TOKEN_MAX_BODY_BYTES + 1),
    ],
    [
      'streamed',
      () => streamedRequest('x'.repeat(OIDC_TOKEN_MAX_BODY_BYTES + 1)),
    ],
  ])(
    'returns OAuth invalid_request for %s overflow',
    async (_name, makeRequest) => {
      const response = await handlers(OidcTokenRoute).POST({
        request: makeRequest(),
      });

      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toMatchObject({
        error: 'invalid_request',
      });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(getClient).not.toHaveBeenCalled();
      expect(consumeAuthorizationCode).not.toHaveBeenCalled();
      expect(rotateRefreshToken).not.toHaveBeenCalled();
    },
  );

  it('accepts the exact declared limit and preserves form handling', async () => {
    const body = 'client_id=test-client&grant_type=unsupported';
    const response = await handlers(OidcTokenRoute).POST({
      request: requestWithDeclaredLength(body, OIDC_TOKEN_MAX_BODY_BYTES),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'unsupported_grant_type',
    });
    expect(getClient).toHaveBeenCalledWith('test-client');
  });

  it('preserves a successful refresh-token form request', async () => {
    const response = await handlers(OidcTokenRoute).POST({
      request: new Request('https://example.com/oidc/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'client_id=test-client&grant_type=refresh_token&refresh_token=old',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      access_token: 'access-token',
      id_token: 'id-token',
      refresh_token: 'new-refresh-token',
    });
    expect(rotateRefreshToken).toHaveBeenCalledWith('old', 'test-client');
  });

  it('preserves the empty-form error', async () => {
    getClient.mockClear();
    const response = await handlers(OidcTokenRoute).POST({
      request: new Request('https://example.com/oidc/token', {
        method: 'POST',
        body: '',
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'invalid_client',
    });
    expect(getClient).not.toHaveBeenCalled();
  });
});

describe('media-for-verse body boundary', () => {
  const validBody = JSON.stringify({
    book: 'John',
    chapter: 3,
    verse: 16,
    limit: 6,
  });

  it.each([
    [
      'declared',
      () =>
        requestWithDeclaredLength(
          validBody,
          MEDIA_FOR_VERSE_MAX_BODY_BYTES + 1,
        ),
    ],
    [
      'streamed',
      () => streamedRequest('x'.repeat(MEDIA_FOR_VERSE_MAX_BODY_BYTES + 1)),
    ],
  ])(
    'rejects %s overflow before search or database work',
    async (_name, makeRequest) => {
      const response = await handlers(MediaForVerseRoute).POST({
        request: makeRequest(),
      });

      expect(response.status).toBe(413);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(osSearch).not.toHaveBeenCalled();
      expect(hydrateUploads).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['malformed JSON', '{'],
    ['an empty body', ''],
  ])('returns 400 for %s under the limit', async (_name, body) => {
    const response = await handlers(MediaForVerseRoute).POST({
      request: new Request('https://example.com', {
        method: 'POST',
        body,
      }),
    });

    expect(response.status).toBe(400);
    expect(osSearch).not.toHaveBeenCalled();
  });

  it('accepts the exact declared limit and preserves public-only search', async () => {
    const response = await handlers(MediaForVerseRoute).POST({
      request: requestWithDeclaredLength(
        validBody,
        MEDIA_FOR_VERSE_MAX_BODY_BYTES,
      ),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [],
      searchUrl: 'https://lets.church/search?bibleRefs=%5B%22John.3.16%22%5D',
    });
    expect(accessControlFilter).toHaveBeenCalledOnce();
    expect(osSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          bool: {
            filter: [
              { term: { access: 'PUBLIC' } },
              { terms: { bibleRefs: ['John.3.16'] } },
            ],
          },
        },
      }),
    );
  });
});
