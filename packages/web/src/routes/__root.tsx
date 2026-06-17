import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  redirect,
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

// Whether the current viewer should be locked out by maintenance mode. Returns
// just enough for the root gate; the /maintenance page fetches the message
// separately via tRPC.
const $getMaintenanceGate = createServerFn({ method: 'GET' }).handler(
  async () => {
    const [{ getSession }, { getMaintenanceConfig }] = await Promise.all([
      import('@/util/auth'),
      import('@/util/maintenance'),
    ]);
    const [session, config] = await Promise.all([
      getSession(),
      getMaintenanceConfig(),
    ]);
    return {
      enabled: config.maintenanceMode,
      isAdmin: session?.appUser?.role === 'ADMIN',
    };
  },
);

// Paths that stay reachable during maintenance so an admin can log in and the
// maintenance page itself can render. `/trpc` is excluded here because the tRPC
// layer has its own gate (with a login allowlist).
const MAINTENANCE_EXEMPT_PREFIXES = ['/maintenance', '/auth', '/trpc'];

export const Route = createRootRouteWithContext<AppContextType>()({
  beforeLoad: async ({ context: { queryClient }, location }) => {
    if (
      MAINTENANCE_EXEMPT_PREFIXES.some((prefix) =>
        location.pathname.startsWith(prefix),
      )
    ) {
      return;
    }

    // Cache the gate result briefly so client-side navigations don't round-trip
    // on every link click, while still revalidating quickly after an admin
    // toggles maintenance mode.
    const { enabled, isAdmin } = await queryClient.fetchQuery({
      queryKey: ['maintenance-gate'],
      queryFn: () => $getMaintenanceGate(),
      staleTime: 30_000,
    });

    if (enabled && !isAdmin) {
      throw redirect({ to: '/maintenance' });
    }
  },
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

    const canPlay = (type: string) =>
      typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type);

    posthog.setPersonProperties({
      // Video
      av1_supported: canPlay('video/mp4; codecs="av01.0.05M.08"'),
      h264_supported: canPlay('video/mp4; codecs="avc1.42E01E"'),
      h265_supported:
        canPlay('video/mp4; codecs="hvc1.1.6.L93.B0"') ||
        canPlay('video/mp4; codecs="hev1.1.6.L93.B0"'),
      vp9_supported: canPlay('video/mp4; codecs="vp09.00.10.08"'),
      vp8_supported: canPlay('video/webm; codecs="vp8"'),
      // Audio
      aac_supported: canPlay('audio/mp4; codecs="mp4a.40.2"'),
      opus_supported: canPlay('audio/webm; codecs="opus"'),
      flac_supported: canPlay('audio/mp4; codecs="flac"'),
      vorbis_supported: canPlay('audio/webm; codecs="vorbis"'),
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
