import { createServerFileRoute } from '@tanstack/react-start/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/trpc';
import { createContext } from '@/trpc/context';
import logger from '@/util/logger';

const moduleLogger = logger.child({
  module: 'routes/trpc',
});

export const ServerRoute = createServerFileRoute('/trpc/$').methods({
  GET: async ({ request }) => {
    moduleLogger.info('GET /trpc');
    return fetchRequestHandler({
      endpoint: '/trpc',
      req: request,
      router: appRouter,
      createContext,
    });
  },
  POST: async ({ request }) => {
    moduleLogger.info('POST /trpc');
    return fetchRequestHandler({
      endpoint: '/trpc',
      req: request,
      router: appRouter,
      createContext,
    });
  },
});
