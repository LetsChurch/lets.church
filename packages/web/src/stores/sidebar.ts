import { createIsomorphicFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import Cookies from 'js-cookie';

export const SIDEBAR_COOKIE_NAME = 'lc-sidebar-collapsed';
export const SIDEBAR_CHANGE_EVENT = 'sidebar-collapsed-change';

export const getInitialSidebarCollapsed = createIsomorphicFn()
  .client(() =>
    Boolean(JSON.parse(Cookies.get(SIDEBAR_COOKIE_NAME) ?? 'false')),
  )
  .server(() => Boolean(JSON.parse(getCookie(SIDEBAR_COOKIE_NAME) ?? 'false')));

export function setSidebarCollapsed(collapsed: boolean) {
  if (typeof window !== 'undefined') {
    Cookies.set(SIDEBAR_COOKIE_NAME, JSON.stringify(collapsed));
    window.dispatchEvent(
      new CustomEvent(SIDEBAR_CHANGE_EVENT, { detail: { collapsed } }),
    );
  }
}
