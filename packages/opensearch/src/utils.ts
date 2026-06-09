import type { JsonValue } from 'type-fest';
import { FilterXSS } from 'xss';

const xss = new FilterXSS({ whiteList: {} });

export function escapeDocument<T extends JsonValue>(doc: T): T {
  if (!doc) {
    return doc;
  }

  if (typeof doc === 'string') {
    return xss.process(doc) as T;
  }

  if (Array.isArray(doc)) {
    return doc.map((v) => escapeDocument(v)) as T;
  }

  if (typeof doc !== 'object') {
    return doc;
  }

  return Object.fromEntries(
    Object.entries(doc).map(([key, val]) => {
      if (!val) {
        return [key, val];
      }

      if (typeof val === 'string') {
        return [key, xss.process(val)];
      }

      if (typeof val === 'object') {
        return [key, escapeDocument(val as JsonValue)];
      }

      return [key, val];
    }),
  ) as T;
}

// Requires at least two elements and always returns 2-tuples — the previous
// `arr.length <= 2` shortcut mis-cast a single-element input to a `[T, T]`.
export function adjacentPairs<T>(arr: [T, T, ...T[]]): Array<[T, T]> {
  const pairs: Array<[T, T]> = [];

  for (let i = 0; i < arr.length - 1; i++) {
    pairs.push([arr[i] as T, arr[i + 1] as T]);
  }

  return pairs;
}
