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

// Stable, unversioned index name. `push-mappings.ts` is idempotent (create if
// missing, else additive mapping updates) — a normal deploy leaves it alone.
// Static settings (`index.knn`) and incompatible mapping changes can't be
// applied to a live index, so when one is needed the index is destroyed first
// (manually, before that deploy), then recreated fresh + repopulated by
// `index-verses.ts`.
export const VERSE_INDEX = 'lets_bible_verses';

// Companion index of multi-verse THOUGHT UNITS: the translators' own paragraphs
// (reading blocks), embedded whole. Verse boundaries (Stephanus 1551) routinely
// split a single thought — "the fruit of the Spirit" spans Galatians 5:22-23,
// Romans 8:28's thought completes at 8:29-30 — so a paraphrase of a thought
// often matches no single verse's wording. Embedding the translator's paragraph
// gives the verse-finder a recall lane for spanning thoughts (the model then
// cites the anchor verse inside the passage). Same cluster, own index. See
// search/passages.ts + index-passages.ts.
export const PASSAGE_INDEX = 'lets_bible_passages';

// Search pipeline that fuses the two branches of a `hybrid` query — the lexical
// bool and the semantic knn — via min-max score normalization + a weighted
// arithmetic mean (created by push-mappings.ts). Passed as the `search_pipeline`
// URL param on the hybrid search request.
export const HYBRID_PIPELINE = 'lets_bible_hybrid';

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
export type OsHits<TSource, TFields = Record<string, unknown>> = {
  hits: {
    total?: { value: number } | number;
    hits: Array<{
      _source?: TSource;
      fields?: TFields;
      _score?: number;
      highlight?: Record<string, string[]>;
    }>;
  };
};

export async function osSearch<
  TSource = unknown,
  TFields = Record<string, unknown>,
>(
  params: Record<string, unknown> & {
    index: string;
    scroll?: string;
    // A `hybrid` query is only scored correctly when run through its fusion
    // search pipeline (HYBRID_PIPELINE); pass it here as a URL param.
    search_pipeline?: string;
  },
): Promise<OsHits<TSource, TFields>> {
  const { index, scroll, search_pipeline, ...body } = params;
  const res = await client.search({ index, scroll, search_pipeline, body });
  return res.body as OsHits<TSource, TFields>;
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
