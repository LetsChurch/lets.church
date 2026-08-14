import '@tanstack/react-start/server-only';
import { readBoundedRequest, RequestBodyTooLargeError } from '@letschurch/util';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { createContext } from '@/trpc/context';
import { appRouter } from '@/trpc/router';
import logger from '@/util/logger';

const moduleLogger = logger.child({
  module: 'routes/trpc',
});

export async function handleTrpcRequest(
  request: Request,
  maxBodyBytes: number,
) {
  moduleLogger.info(`${request.method} /trpc`);

  let boundedRequest = request;
  if (request.method === 'POST') {
    try {
      boundedRequest = await readBoundedRequest(request, maxBodyBytes);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return new Response('Request body too large', {
          status: 413,
          headers: { 'cache-control': 'no-store' },
        });
      }
      throw error;
    }
  }

  return fetchRequestHandler({
    endpoint: '/trpc',
    req: boundedRequest,
    router: appRouter,
    createContext,
  });
}
