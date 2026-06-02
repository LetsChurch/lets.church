import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@/trpc';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

import { QueryClient } from '@tanstack/react-query';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  splitLink,
} from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import superjson from 'superjson';

function getUrl() {
  const base = (() => {
    if (typeof window !== 'undefined') {
      return '';
    }

    return `http://localhost:${process.env.PORT ?? 3000}`;
  })();

  return `${base}/trpc`;
}

/**
 * On the server this function gets the client request headers. On the client
 * this function returns an empty object. This is intended for forwarding
 * client headers to the TRPC endpoint from the server during SSR.
 */
const getIncomingHeaders = createIsomorphicFn()
  .client(() => ({}))
  .server(() => {
    const request = getRequest();
    const headers: Record<string, string> = {};

    // Explicitly forward the cookie header for authentication during SSR
    const cookie = request.headers.get('cookie');
    if (cookie) {
      headers.cookie = cookie;
    }

    return headers;
  });

/**
 * This trpc client uses the above getIncomingHeaders function to properly set
 * headers.
 */
const sharedLinkOpts = {
  transformer: superjson,
  url: getUrl(),
  headers: async () => {
    const headers = getIncomingHeaders();
    // On server-side, explicitly ensure cookie header is forwarded
    // This is critical for authentication during SSR
    return headers;
  },
  fetch(
    url: Parameters<typeof fetch>[0],
    options?: Parameters<typeof fetch>[1],
  ) {
    return fetch(url, {
      ...options,
      credentials: 'include',
    });
  },
};

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    // Route long-running LLM-eval calls through the non-batching httpLink
    // so each per-model mutation gets its own HTTP request and resolves
    // independently. Without this, the default httpBatchLink bundles all
    // N parallel mutateAsync calls into one HTTP POST that only responds
    // after the slowest model finishes — even though tRPC processes the
    // batch entries concurrently server-side, the client can't render
    // any card until all of them are done. Everything else stays batched.
    //
    // NOTE: the path string below must stay in lockstep with the
    // procedure name in
    // `packages/web/src/trpc/procedures/dashboard/admin.ts`. If
    // `evaluateLlmModel` gets renamed, this string-match silently
    // falls through to the batching path and the eval-page UX
    // regresses to "blocks until the slowest model finishes". Update
    // both sides together.
    splitLink({
      condition: (op) =>
        op.type === 'mutation' &&
        op.path === 'dashboard.admin.evaluateLlmModel',
      true: httpLink(sharedLinkOpts),
      false: httpBatchLink(sharedLinkOpts),
    }),
  ],
});

/**
 * Context for tanstack start related to trpc and react-query
 * Creates a fresh QueryClient per request to prevent state pollution in SSR
 */
export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      dehydrate: { serializeData: superjson.serialize },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });

  const trpcQueryProxy = createTRPCOptionsProxy({
    client: trpcClient,
    queryClient: queryClient,
  });

  return {
    queryClient,
    trpc: trpcQueryProxy,
  };
}

/**
 * Convenience provider for trpc
 */
export function Provider({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      {children}
    </TRPCProvider>
  );
}
