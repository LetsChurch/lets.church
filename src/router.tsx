import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { routeTree } from './routeTree.gen';
import { getContext, Provider as TrpcProvider } from './trpc/react';

declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__: import('@tanstack/query-core').QueryClient;
  }
}

function createContext() {
  const context = getContext();

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.__TANSTACK_QUERY_CLIENT__ = context.queryClient;
  }

  return { ...context };
}

export type AppContextType = ReturnType<typeof createContext>;

// TanStack Start automatically discovers and calls this createRouter function:
// - Per-request on server (ensuring fresh QueryClient per request)
// - Once on client during hydration
export function createRouter() {
  const context = createContext();

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    context,
    Wrap: ({ children }) => (
      <QueryClientProvider client={context.queryClient}>
        <TrpcProvider>{children}</TrpcProvider>
      </QueryClientProvider>
    ),
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient: context.queryClient,
  });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
