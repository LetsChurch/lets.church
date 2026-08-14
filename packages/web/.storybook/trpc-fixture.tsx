import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { useState, type ReactNode } from 'react';
import superjson from 'superjson';

import type { AppRouter } from '@/trpc';
import { TRPCProvider } from '@/trpc/react';

type StoryTRPCProviderProps = {
  children: ReactNode;
  responses: Readonly<Record<string, unknown>>;
};

function createMockTRPCClient(responses: StoryTRPCProviderProps['responses']) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: 'http://storybook.invalid/trpc',
        transformer: superjson,
        fetch: async (input) => {
          const url = new URL(
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url,
          );
          const marker = '/trpc/';
          const markerIndex = url.pathname.indexOf(marker);
          const paths = decodeURIComponent(
            url.pathname.slice(markerIndex + marker.length),
          ).split(',');

          const results = paths.map((path) => {
            if (!Object.hasOwn(responses, path)) {
              throw new Error(
                `Unexpected Storybook tRPC procedure request: ${path}`,
              );
            }

            return {
              result: { data: superjson.serialize(responses[path]) },
            };
          });

          return new Response(JSON.stringify(results), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      }),
    ],
  });
}

export function StoryTRPCProvider({
  children,
  responses,
}: StoryTRPCProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
  );
  const [trpcClient] = useState(() => createMockTRPCClient(responses));

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
