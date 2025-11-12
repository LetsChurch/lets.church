import logger from '@letschurch/util';
import { createFileRoute } from '@tanstack/react-router';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/trpc';
import { createContext } from '@/trpc/context';

const moduleLogger = logger.child({
  module: 'routes/trpc',
});

export const Route = createFileRoute('/trpc/$')({
  component: () => null,
  server: {
    handlers: {
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
    },
  },
});
