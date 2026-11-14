import { createIsomorphicFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import Cookies from 'js-cookie';
import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

export const THEME_COOKIE_NAME = 'lc-theme';
export const THEME_CHANGE_EVENT = 'theme-change';

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function parseTheme(value: string | undefined): Theme | undefined {
  return value === 'light' || value === 'dark' ? value : undefined;
}

const getThemeCookie = createIsomorphicFn()
  .client(() => parseTheme(Cookies.get(THEME_COOKIE_NAME)))
  .server(() => parseTheme(getCookie(THEME_COOKIE_NAME)));

export const getInitialTheme = (): Theme =>
  getThemeCookie() ?? getSystemTheme();

export function setTheme(theme: Theme) {
  if (typeof window !== 'undefined') {
    Cookies.set(THEME_COOKIE_NAME, theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mantine-color-scheme', theme);
    window.dispatchEvent(
      new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme } }),
    );
  }
}

export function initializeTheme() {
  if (typeof window !== 'undefined') {
    const theme = getInitialTheme();
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mantine-color-scheme', theme);
  }
}

// What the server rendered: the cookie, else light (it can't see the OS
// theme). The client can reproduce this exactly from the same cookie, which is
// what hydration needs. The inline script in __root.tsx then corrects
// `data-theme` before React runs, so CSS `dark:` styles are right from the
// first paint; only JS-rendered theme values need this hook.
const getServerRenderedTheme = (): Theme => getThemeCookie() ?? 'light';

function subscribeToTheme(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

function getDocumentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'dark'
    : 'light';
}

/**
 * The active theme, safe to render: it matches the server during hydration,
 * then switches to the document's real theme (which may come from the OS).
 */
export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribeToTheme,
    getDocumentTheme,
    getServerRenderedTheme,
  );
}
