import { QueryClient } from '@tanstack/react-query';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import {
  createTRPCContext,
  createTRPCOptionsProxy,
} from '@trpc/tanstack-react-query';
import superjson from 'superjson';
import type { AppRouter } from '@/trpc';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

function getUrl() {
  const base =
    typeof window !== 'undefined'
      ? ''
      : `http://localhost:${process.env.PORT ?? 3000}`;
  return `${base}/trpc`;
}

// On the server, forward the incoming request's cookie so tRPC sees the session
// during SSR. On the client, no-op (the browser attaches cookies itself).
const getIncomingHeaders = createIsomorphicFn()
  .client(() => ({}))
  .server(() => {
    const request = getRequest();
    const headers: Record<string, string> = {};
    const cookie = request.headers.get('cookie');
    if (cookie) {
      headers.cookie = cookie;
    }
    return headers;
  });

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      transformer: superjson,
      url: getUrl(),
      headers: () => getIncomingHeaders(),
      fetch(url, options) {
        return fetch(url, { ...options, credentials: 'include' });
      },
    }),
  ],
});

// Fresh QueryClient + tRPC proxy per request to avoid SSR state pollution.
export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000 },
      dehydrate: { serializeData: superjson.serialize },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });

  const trpc = createTRPCOptionsProxy({
    client: trpcClient,
    queryClient,
  });

  return { queryClient, trpc };
}

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
