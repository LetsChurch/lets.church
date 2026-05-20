import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useMatches,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import posthog from 'posthog-js';
import { type ReactNode, useEffect } from 'react';
import '@fontsource-variable/inter';
import appCss from '@/app.css?url';
import type { AppContextType } from '@/router';
import { setBrowserSize } from '@/stores/browser-size';
import { getInitialTheme, initializeTheme } from '@/stores/theme';

const brand = '#6366f1';
// Brand colors from the translucent gradient over the page background
const brandColorLight = '#BFBFFF';
const brandColorDark = '#2B2B6E';

const $getHasValidSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getSession } = await import('@/util/auth');
    const session = await getSession();
    return Boolean(session);
  },
);

export const Route = createRootRouteWithContext<AppContextType>()({
  loader: async ({ context: { queryClient, trpc } }) => {
    const isLoggedIn = await queryClient.fetchQuery({
      ...trpc.common.hasValidSession.queryOptions(),
      queryFn: () => $getHasValidSession(),
    });

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
        media: '(prefers-color-scheme: light)',
        content: brandColorLight,
      },
      {
        name: 'theme-color',
        media: '(prefers-color-scheme: dark)',
        content: brandColorDark,
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
        color: brand,
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const matches = useMatches();
  const isEmbedRoute = matches.some((match) =>
    match.routeId.startsWith('/embed'),
  );

  useEffect(() => {
    // Initialize theme (skip for embed routes as they're always light)
    if (!isEmbedRoute) {
      initializeTheme();
    }

    // Initialize PostHog
    posthog.init('phc_nrdBwyxcJ3Tc0g1Gq1J5Gd2w1nmpx0IIK4HQBusIu6P', {
      defaults: '2026-01-30',
      api_host: 'https://z.lets.church',
      persistence: 'memory',
      person_profiles: 'identified_only',
    });

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
  }, [isEmbedRoute]);

  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  const matches = useMatches();

  // Check if we're on an embed route
  const isEmbedRoute = matches.some((match) =>
    match.routeId.startsWith('/embed'),
  );

  // Force light theme for embed routes, otherwise use user's theme
  const theme = isEmbedRoute ? 'light' : getInitialTheme();

  return (
    <html lang="en" data-theme={theme} data-mantine-color-scheme={theme}>
      <head>
        <HeadContent />
        {!isEmbedRoute ? (
          <script
            // biome-ignore lint/security/noDangerouslySetInnerHtml: intentional blocking script to set theme before first paint
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var m=document.cookie.match(/lc-theme=([^;]+)/);var t=m?m[1]:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-mantine-color-scheme',t);}}catch(e){}})();`,
            }}
          />
        ) : null}
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
