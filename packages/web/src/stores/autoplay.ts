import { createIsomorphicFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import Cookies from 'js-cookie';

export const AUTOPLAY_COOKIE_NAME = 'lc-autoplay-enabled';

export const getAutoplayEnabled = createIsomorphicFn()
  .client(() => {
    const stored = Cookies.get(AUTOPLAY_COOKIE_NAME);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return true; // Default to enabled
  })
  .server(() => {
    const stored = getCookie(AUTOPLAY_COOKIE_NAME);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return true; // Default to enabled
  });

export function setAutoplayEnabled(enabled: boolean) {
  if (typeof window !== 'undefined') {
    Cookies.set(AUTOPLAY_COOKIE_NAME, enabled.toString(), { expires: 365 });
  }
}
