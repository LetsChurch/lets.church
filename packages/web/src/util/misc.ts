import { words } from 'es-toolkit';

export function escapeLikePattern(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function getInitials(text: string, limit = 3): string {
  return words(text.replace(/'\w+/g, ''))
    .slice(0, limit)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export function adjacentPairs<T>(arr: [T, ...T[]]): Array<[T, T] | [T]> {
  if (arr.length <= 2) {
    return [arr] as Array<[T, T]>;
  }

  const pairs: [T, T][] = [];

  for (let i = 0; i < arr.length - 1; i++) {
    pairs.push([arr[i] as T, arr[i + 1] as T]);
  }

  return pairs;
}
