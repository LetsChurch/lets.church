import { createIsomorphicFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import Cookies from 'js-cookie';

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

export const getInitialBrowserSize = createIsomorphicFn()
  .client((): BrowserSize => {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  })
  .server((): BrowserSize => {
    const cookieValue = getCookie(BROWSER_SIZE_COOKIE_NAME);
    if (cookieValue) {
      try {
        return JSON.parse(cookieValue);
      } catch {
        return DEFAULT_SIZE;
      }
    }
    return DEFAULT_SIZE;
  });

export function setBrowserSize(size: BrowserSize) {
  if (typeof window !== 'undefined') {
    Cookies.set(BROWSER_SIZE_COOKIE_NAME, JSON.stringify(size));
    window.dispatchEvent(
      new CustomEvent(BROWSER_SIZE_CHANGE_EVENT, { detail: size }),
    );
  }
}
