import { createIsomorphicFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import Cookies from 'js-cookie';
import { useSyncExternalStore } from 'react';

export const BROWSER_SIZE_COOKIE_NAME = 'lc-browser-size';
export const BROWSER_SIZE_CHANGE_EVENT = 'browser-size-change';

export type BrowserSize = {
  width: number;
  height: number;
};

const DEFAULT_SIZE: BrowserSize = {
  width: 1920,
  height: 1080,
};

function parseBrowserSize(cookieValue: string | undefined): BrowserSize {
  if (!cookieValue) return DEFAULT_SIZE;
  try {
    return JSON.parse(cookieValue);
  } catch {
    return DEFAULT_SIZE;
  }
}

// The size the server rendered with. On the client this is the cookie as it
// stood when the page loaded, captured at module evaluation. Reading it lazily
// would be too late: child routes can hydrate after the root route's mount
// effect has rewritten the cookie with the live window size. Capturing here is
// safe regardless of route/module load order because the only writer of this
// cookie is `setBrowserSize` below, which can't run before this module has
// evaluated (and so before this snapshot is taken).
const hydrationBrowserSize: BrowserSize | null =
  typeof document === 'undefined'
    ? null
    : parseBrowserSize(Cookies.get(BROWSER_SIZE_COOKIE_NAME));

const getServerBrowserSize = createIsomorphicFn()
  .server(() => parseBrowserSize(getCookie(BROWSER_SIZE_COOKIE_NAME)))
  .client(() => hydrationBrowserSize);

let windowSnapshot: BrowserSize | null = null;

function getWindowBrowserSize(): BrowserSize {
  if (
    windowSnapshot?.width !== window.innerWidth ||
    windowSnapshot.height !== window.innerHeight
  ) {
    windowSnapshot = { width: window.innerWidth, height: window.innerHeight };
  }
  return windowSnapshot;
}

function subscribeToWindowSize(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

/**
 * The live window size. While hydrating it returns the size the server
 * rendered with, so the markup matches; React then re-renders with the real
 * window size. (Computing from `window` during hydration leaves the server's
 * inline styles in the DOM: React doesn't patch attribute mismatches.)
 */
export function useBrowserSize(): BrowserSize {
  return useSyncExternalStore(
    subscribeToWindowSize,
    getWindowBrowserSize,
    () => getServerBrowserSize() ?? DEFAULT_SIZE,
  );
}

export function setBrowserSize(size: BrowserSize) {
  if (typeof window !== 'undefined') {
    Cookies.set(BROWSER_SIZE_COOKIE_NAME, JSON.stringify(size));
    window.dispatchEvent(
      new CustomEvent(BROWSER_SIZE_CHANGE_EVENT, { detail: size }),
    );
  }
}
