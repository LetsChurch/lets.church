import type { JsonValue } from 'type-fest';
import { FilterXSS } from 'xss';
import { Client } from '@elastic/elasticsearch';
import envariant from '@knpwrs/envariant';
import waitOn from 'wait-on';

const ELASTICSEARCH_URL = envariant('ELASTICSEARCH_URL');

export const client = new Client({
  node: ELASTICSEARCH_URL,
});

export async function waitForElasticsearch() {
  return waitOn({
    resources: [ELASTICSEARCH_URL],
  });
}

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

      return [key, escapeDocument(val)];
    }),
  ) as T;
}
