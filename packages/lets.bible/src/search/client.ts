import { Client } from '@opensearch-project/opensearch';
import { z } from 'zod';

// lets.bible runs its search on the SAME OpenSearch cluster as the rest of the
// stack, but — exactly like its Postgres database — it owns its own indices and
// mappings. Everything here is namespaced under `lets_bible_*` so it never
// collides with the web app's `lc_*` indices, and lets.bible keeps its own thin
// client (it does NOT import `@letschurch/opensearch`, which is the web app's
// index management). We migrated off Elasticsearch alongside the web app.
const {
  OPENSEARCH_URL,
  OPENSEARCH_USERNAME,
  OPENSEARCH_PASSWORD,
  OPENSEARCH_SSL_REJECT_UNAUTHORIZED,
} = z
  .object({
    OPENSEARCH_URL: z.string(),
    OPENSEARCH_USERNAME: z.string().optional(),
    OPENSEARCH_PASSWORD: z.string().optional(),
    // Dev OpenSearch ships self-signed demo certs; default to not verifying.
    OPENSEARCH_SSL_REJECT_UNAUTHORIZED: z
      .enum(['true', 'false'])
      .default('false'),
  })
  .parse(process.env);

// Bumped (v1 → v2 …) whenever the mapping changes incompatibly; reindex into the
// new name, then flip the alias/constant.
export const VERSE_INDEX = 'lets_bible_verses_v2';

export const client = new Client({
  node: OPENSEARCH_URL,
  ...(OPENSEARCH_USERNAME && OPENSEARCH_PASSWORD
    ? { auth: { username: OPENSEARCH_USERNAME, password: OPENSEARCH_PASSWORD } }
    : {}),
  ssl: { rejectUnauthorized: OPENSEARCH_SSL_REJECT_UNAUTHORIZED === 'true' },
});

// Transport wrappers that hide OpenSearch's request `body` wrapping and its
// `{ body, statusCode, ... }` response envelope, returning the response body in
// the flattened shape our callers expect (matching the previous Elasticsearch 8
// client). `index`/`scroll` are URL params; everything else is the search body.
export type OsHits<T> = {
  hits: {
    total?: { value: number } | number;
    hits: Array<{
      _source?: T;
      _score?: number;
      highlight?: Record<string, string[]>;
    }>;
  };
};

export async function osSearch<T = unknown>(
  params: Record<string, unknown> & { index: string; scroll?: string },
): Promise<OsHits<T>> {
  const { index, scroll, ...body } = params;
  const res = await client.search({ index, scroll, body });
  return res.body as OsHits<T>;
}

export async function osMsearch(
  searches: Array<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const res = await client.msearch({ body: searches });
  return res.body as Record<string, unknown>;
}

// Count query (the request body needs wrapping; the response is `{ body: { count } }`).
export async function osCount(
  params: Record<string, unknown> & { index: string },
): Promise<number> {
  const { index, ...body } = params;
  const res = await client.count({ index, body });
  return (res.body as { count: number }).count;
}

// Block until the cluster answers a ping (the index/push scripts run right after
// `docker compose up`, when OpenSearch may still be starting).
export async function waitForOpenSearch(
  retries = 60,
  delayMs = 1000,
): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await client.ping();
      return;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('OpenSearch not reachable');
}
