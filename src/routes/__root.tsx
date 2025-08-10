import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { AppContextType } from '@/router';

export const Route = createRootRouteWithContext<AppContextType>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: "Let's Church",
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  
  return (
    <QueryClientProvider client={queryClient}>
      <RootDocument>
        <Outlet />
      </RootDocument>
    </QueryClientProvider>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
