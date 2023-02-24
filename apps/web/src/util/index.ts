import prettyMs from 'pretty-ms';
import { useLocation } from 'solid-start';

export function notEmpty<T>(t?: T | null): t is T {
  return t !== null && t !== undefined;
}

export function useSerializedLocation() {
  const loc = useLocation();
  return `${loc.pathname}${loc.search}`;
}

export function useEncodedLocation() {
  const loc = useSerializedLocation();
  return encodeURIComponent(loc);
}

export function useLoginLocation() {
  const redir = useEncodedLocation();
  return `/auth/login?redirect=${redir}`;
}

export function useLogoutLocation() {
  const redir = useEncodedLocation();
  return `/auth/logout?redirect=${redir}`;
}

export function formatTime(ms: number) {
  const res = prettyMs(ms, { colonNotation: true, secondsDecimalDigits: 0 });
  const sections = res.split(':').length;
  return res.padStart(sections * 2 + sections - 1, '0');
}
