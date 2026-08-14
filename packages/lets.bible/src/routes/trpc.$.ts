import { readBoundedRequest, RequestBodyTooLargeError } from '@letschurch/util';
import { createFileRoute } from '@tanstack/react-router';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { createContext } from '@/trpc/context';
import { appRouter } from '@/trpc/router';

/**
 * The largest mutation stores a 10,000-character verse note (at most 40 KiB
 * of UTF-8). A 256 KiB envelope leaves more than six times that payload for
 * tRPC metadata and normal batches without admitting import-sized bodies.
 */
export const BIBLE_TRPC_MAX_BODY_BYTES = 256 * 1024;

function getHandler({ request }: { request: Request }) {
  return fetchRequestHandler({
    endpoint: '/trpc',
    req: request,
    router: appRouter,
    createContext,
  });
}

async function postHandler({ request }: { request: Request }) {
  let boundedRequest: Request;
  try {
    boundedRequest = await readBoundedRequest(
      request,
      BIBLE_TRPC_MAX_BODY_BYTES,
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return new Response('Request body too large', {
        status: 413,
        headers: { 'cache-control': 'no-store' },
      });
    }
    throw error;
  }

  return fetchRequestHandler({
    endpoint: '/trpc',
    req: boundedRequest,
    router: appRouter,
    createContext,
  });
}

export const Route = createFileRoute('/trpc/$')({
  component: () => null,
  server: {
    handlers: {
      GET: getHandler,
      POST: postHandler,
    },
  },
});
