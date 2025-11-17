import { createIsomorphicFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import Cookies from 'js-cookie';

type Theme = 'light' | 'dark';

export const THEME_COOKIE_NAME = 'lc-theme';
export const THEME_CHANGE_EVENT = 'theme-change';

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export const getInitialTheme = createIsomorphicFn()
  .client(() => {
    const stored = Cookies.get(THEME_COOKIE_NAME);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return getSystemTheme();
  })
  .server(() => {
    const stored = getCookie(THEME_COOKIE_NAME);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return 'light';
  });

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
