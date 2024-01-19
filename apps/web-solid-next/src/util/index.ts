import prettyMs from 'pretty-ms';
import { useLocation } from '@solidjs/router';
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type Optional<T> = T | null | undefined;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function notEmpty<T>(t?: T | null): t is T {
  return t !== null && t !== undefined;
}

export function chunk<T>(
  arr: Array<T>,
  chunkSize = 1,
  cache: Array<typeof arr> = [],
) {
  const tmp = [...arr];
  if (chunkSize <= 0) return cache;
  while (tmp.length) cache.push(tmp.splice(0, chunkSize));
  return cache;
}

export function formatTime(ms: number) {
  const res = prettyMs(ms, { colonNotation: true, secondsDecimalDigits: 0 });
  const sections = res.split(':').length;
  return res.padStart(sections * 2 + sections - 1, '0');
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
