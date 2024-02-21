import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export { default as invariant } from 'tiny-invariant';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

export function easeOutExpo(x: number): number {
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

export type Optional<T> = T | null | undefined;
