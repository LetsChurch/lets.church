import { FilterXSS } from 'xss';
import type { JsonValue } from 'type-fest';

const xss = new FilterXSS({ whiteList: {} });

export default { xss };

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

      return [key, escapeDocument(val)];
    }),
  ) as T;
}
