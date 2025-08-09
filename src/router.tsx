import { QueryClient } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { routeTree } from './routeTree.gen';

function createContext() {
  const queryClient = new QueryClient();

  return { queryClient };
}

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

export type AppContextType = ReturnType<typeof createContext>;

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
