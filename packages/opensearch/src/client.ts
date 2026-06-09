import { Client } from '@opensearch-project/opensearch';
import waitOn from 'wait-on';
import { z } from 'zod';

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

// OpenSearch client. We migrated off Elasticsearch because Reciprocal Rank
// Fusion is a license-gated (Platinum) feature there; OpenSearch ships RRF in
// the free distribution via the score-ranker search-pipeline processor.
//
// Lives in its own module (not index.ts) so `media-search.ts` can import the
// transport wrappers without creating an index.ts <-> media-search.ts import
// cycle (which broke Vite SSR with a TDZ "before initialization" error).
export const client = new Client({
  node: OPENSEARCH_URL,
  ...(OPENSEARCH_USERNAME && OPENSEARCH_PASSWORD
    ? {
        auth: {
          username: OPENSEARCH_USERNAME,
          password: OPENSEARCH_PASSWORD,
        },
      }
    : {}),
  ssl: { rejectUnauthorized: OPENSEARCH_SSL_REJECT_UNAUTHORIZED === 'true' },
});

export async function waitForOpenSearch() {
  // TCP probe (not HTTP) so we don't trip on TLS / auth before readiness.
  const u = new URL(OPENSEARCH_URL);
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  return waitOn({ resources: [`tcp:${u.hostname}:${port}`] });
}

// Loose query/request shapes. The OpenSearch client's generated types are
// thinner than the old `estypes`, and every search response is validated with
// zod downstream, so we model request fragments as plain records.
export type OsQuery = Record<string, unknown>;
export type OsMsearchItem = Record<string, unknown>;

// Transport wrappers that hide OpenSearch's request `body` wrapping and its
// `{ body, statusCode, ... }` response envelope, returning the response body in
// the flattened shape our zod schemas already expect (matching the previous
// Elasticsearch 8 client). `index`, `scroll`, and `search_pipeline` are URL
// params; everything else is the search body.
export async function osSearch(
  params: OsMsearchItem & {
    index: string;
    scroll?: string;
    search_pipeline?: string;
  },
): Promise<Record<string, unknown>> {
  const { index, scroll, search_pipeline, ...body } = params;
  const res = await client.search({ index, scroll, search_pipeline, body });
  return res.body as Record<string, unknown>;
}

export async function osMsearch(
  searches: Array<OsMsearchItem>,
): Promise<Record<string, unknown>> {
  const res = await client.msearch({ body: searches });
  return res.body as Record<string, unknown>;
}
