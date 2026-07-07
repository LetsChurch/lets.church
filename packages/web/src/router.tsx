import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';

import { routeTree } from './routeTree.gen';
import { getContext, Provider as TrpcProvider } from './trpc/react';

declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- global definition
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
    // Preload routes on hover/touch intent. Safe now that loaders only prime
    // caches and guard — no side-effecting work (e.g. view recording) lives in
    // a loader, so preloading a route can't trigger user-visible side effects.
    defaultPreload: 'intent',
    // Let React Query be the single source of truth for caching. Without this,
    // the router keeps its own 30s preload cache, creating a second caching
    // layer with a different TTL than Query's staleTime. Setting it to 0 means
    // preloads always re-run loaders and Query decides whether to actually
    // refetch. See https://tkdodo.eu/blog/tan-stack-router-and-query
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    // _main.tsx uses <main className="overflow-y-auto"> as the scroll container, not window.
    scrollToTopSelectors: ['main.overflow-y-auto'],
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
