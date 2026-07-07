import { createFileRoute } from '@tanstack/react-router';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { createContext } from '@/trpc/context';
import { appRouter } from '@/trpc/router';

function handler({ request }: { request: Request }) {
  return fetchRequestHandler({
    endpoint: '/trpc',
    req: request,
    router: appRouter,
    createContext,
  });
}

export const Route = createFileRoute('/trpc/$')({
  component: () => null,
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});
