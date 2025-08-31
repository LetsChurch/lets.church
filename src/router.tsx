import { QueryClient } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { routeTree } from './routeTree.gen';

declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__: import('@tanstack/query-core').QueryClient;
  }
}

function createContext() {
  const queryClient = new QueryClient();

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.__TANSTACK_QUERY_CLIENT__ = queryClient;
  }

  return { queryClient };
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
