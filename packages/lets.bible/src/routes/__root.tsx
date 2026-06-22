import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import appCss from '@/app.css?url';
import type { AppContextType } from '@/router';

export const Route = createRootRouteWithContext<AppContextType>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'lets.bible' },
      { name: 'theme-color', content: '#f4f1e9' },
      {
        name: 'description',
        content:
          'Read the Bible, find the passage you’re thinking of, and explore trusted teaching connected directly to the text — all in one focused, ad-free place.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      // PNG — Safari/iOS ignores SVG apple-touch-icons.
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Frank+Ruhl+Libre:wght@400;500&family=Noto+Serif:ital,wght@0,400;0,500;1,400&display=swap',
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  // Register the offline service worker in both dev and prod. The `?dev` flag
  // tells the worker to use a network-first-everything strategy so it never
  // serves Vite a stale module (HMR stays intact); prod uses the cache-optimised
  // strategies. Registration failures are non-fatal — the app stays online-only.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    navigator.serviceWorker
      .register(import.meta.env.DEV ? '/sw.js?dev' : '/sw.js')
      .catch(() => {});

    // Cold-start warm-up: once the SW controls the page, tell it which URLs this
    // first load fetched so it can cache them. Otherwise the first-ever visit
    // isn't offline-ready until a second load (the SW doesn't control — and so
    // can't cache — the requests made during its initial registration).
    const warm = () => {
      const controller = navigator.serviceWorker.controller;
      if (!controller) {
        return;
      }
      const urls = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name);
      controller.postMessage({ type: 'lb-precache', doc: location.href, urls });
    };
    const onReady = () => {
      if (navigator.serviceWorker.controller) {
        warm();
      } else {
        navigator.serviceWorker.addEventListener('controllerchange', warm, {
          once: true,
        });
      }
    };
    if (document.readyState === 'complete') {
      onReady();
    } else {
      window.addEventListener('load', onReady, { once: true });
    }
  }, []);

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
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
