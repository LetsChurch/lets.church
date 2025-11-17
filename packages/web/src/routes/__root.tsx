import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import Plausible from 'plausible-tracker';
import posthog from 'posthog-js';
import { type ReactNode, useEffect } from 'react';
import '@fontsource-variable/inter';
import '@fontsource-variable/roboto-mono';
import appCss from '@/app.css?url';
import type { AppContextType } from '@/router';
import { setBrowserSize } from '@/stores/browser-size';
import { getInitialTheme, initializeTheme } from '@/stores/theme';

const indigo = '#6366f1';

export const Route = createRootRouteWithContext<AppContextType>()({
  loader: async ({ context: { queryClient, trpc } }) => {
    const isLoggedIn = await queryClient.fetchQuery(
      trpc.common.hasValidSession.queryOptions(),
    );

    return {
      isLoggedIn,
    };
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, maximum-scale=1',
      },
      {
        title: "Let's Church",
      },
      {
        name: 'msapplication-TileColor',
        content: '#ffffff',
      },
      {
        name: 'theme-color',
        content: indigo,
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'shortcut icon',
        href: '/favicon.svg',
      },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon-16x16.png',
      },
      {
        rel: 'manifest',
        href: '/site.webmanifest',
      },
      {
        rel: 'mask-icon',
        href: '/favicon.svg',
        color: indigo,
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  useEffect(() => {
    // Initialize theme
    initializeTheme();

    // Initialize PostHog
    posthog.init('phc_nrdBwyxcJ3Tc0g1Gq1J5Gd2w1nmpx0IIK4HQBusIu6P', {
      api_host: 'https://us.i.posthog.com',
      persistence: 'memory',
      person_profiles: 'identified_only',
    });

    // Initialize Plausible
    const plausible = Plausible({
      domain: 'lets.church',
    });

    plausible.enableAutoPageviews();
    plausible.enableAutoOutboundTracking();

    // Set browser size cookie on mount and when window resizes
    const updateBrowserSize = () => {
      setBrowserSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateBrowserSize();

    window.addEventListener('resize', updateBrowserSize);
    return () => window.removeEventListener('resize', updateBrowserSize);
  }, []);

  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  const theme = getInitialTheme();

  return (
    <html lang="en" data-theme={theme} data-mantine-color-scheme={theme}>
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
