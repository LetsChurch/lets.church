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
export function getRouter() {
  const context = createContext();

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    context,
    Wrap: ({ children }) => (
      <TrpcProvider queryClient={context.queryClient}>{children}</TrpcProvider>
    ),
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient: context.queryClient,
  });

  return router;
}
