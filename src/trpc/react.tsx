import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@/trpc';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

import { QueryClient } from '@tanstack/react-query';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import superjson from 'superjson';

const queryClient = new QueryClient({
  defaultOptions: {
    dehydrate: { serializeData: superjson.serialize },
    hydrate: { deserializeData: superjson.deserialize },
  },
});

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
export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      transformer: superjson,
      url: getUrl(),
      headers: async () => {
        const headers = await getIncomingHeaders();
        // On server-side, explicitly ensure cookie header is forwarded
        // This is critical for authentication during SSR
        return headers;
      },
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: 'include',
        });
      },
    }),
  ],
});

/**
 * This is the bridge between trpc and react-query
 */
const trpcQueryProxy = createTRPCOptionsProxy({
  client: trpcClient,
  queryClient: queryClient,
});

/**
 * Context for tanstack start related to trpc and react-query
 */
export function getContext() {
  return {
    queryClient,
    trpc: trpcQueryProxy,
  };
}

/**
 * Convenience provider for trpc
 */
export function Provider({ children }: { children: React.ReactNode }) {
  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      {children}
    </TRPCProvider>
  );
}
