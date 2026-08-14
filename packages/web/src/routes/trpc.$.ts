import { createFileRoute } from '@tanstack/react-router';

import { handleTrpcRequest } from '@/trpc/handler.server';

/**
 * The largest tRPC input is the 64 MiB bulk-media CSV. JSON escaping can
 * double ordinary CSV bytes (quotes, backslashes, and line breaks); the final
 * MiB leaves room for the tRPC envelope, filename, and co-batched calls.
 */
export const WEB_TRPC_MAX_BODY_BYTES = 129 * 1024 * 1024;

export const Route = createFileRoute('/trpc/$')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ request }) => {
        return handleTrpcRequest(request, WEB_TRPC_MAX_BODY_BYTES);
      },
      POST: async ({ request }) => {
        return handleTrpcRequest(request, WEB_TRPC_MAX_BODY_BYTES);
      },
    },
  },
});
