import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import appCss from '@/app.css?url';
import type { AppContextType } from '@/router';

const indigo = '#6366f1';

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
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-page">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
