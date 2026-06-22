import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { LocalSync } from './components/local-sync';
import { routeTree } from './routeTree.gen';
import { getContext, Provider as TrpcProvider } from './trpc/react';

export type AppContextType = ReturnType<typeof getContext>;

export function getRouter() {
  const context = getContext();

  const router = createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    context,
    Wrap: ({ children }) => (
      <TrpcProvider queryClient={context.queryClient}>
        <LocalSync>{children}</LocalSync>
      </TrpcProvider>
    ),
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient: context.queryClient,
  });

  return router;
}
