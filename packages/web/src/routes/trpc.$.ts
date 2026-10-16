import { createFileRoute } from '@tanstack/react-router';

import { trpcMaxBodyBytes, WEB_TRPC_MAX_BODY_BYTES } from '@/trpc/body-limits';
import { handleTrpcRequest } from '@/trpc/handler.server';

// Re-exported for existing callers/tests of the route module.
export { WEB_TRPC_MAX_BODY_BYTES };

export const Route = createFileRoute('/trpc/$')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ request }) => {
        return handleTrpcRequest(request, WEB_TRPC_MAX_BODY_BYTES);
      },
      POST: async ({ request }) => {
        return handleTrpcRequest(request, trpcMaxBodyBytes(request.url));
      },
    },
  },
});
