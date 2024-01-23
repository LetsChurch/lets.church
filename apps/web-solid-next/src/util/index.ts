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

export function formatSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.round(seconds % 60);

  const formattedHours = hours > 0 ? hours.toString() + ':' : '';
  const formattedMinutes =
    hours > 0
      ? minutes.toString().padStart(2, '0') + ':'
      : minutes.toString() + ':';
  const formattedSeconds = remainingSeconds.toString().padStart(2, '0');

  return formattedHours + formattedMinutes + formattedSeconds;
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
