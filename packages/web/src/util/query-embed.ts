import {
  createEmbeddingsTracked,
  EMBED_MODEL,
} from '@letschurch/temporal/util/llm';

import { cacheGetJson, cacheSetJson } from './cache';

// The query embedding (~226 ms OpenAI round-trip) is the single biggest cost in
// a search and — serialized in front of retrieval — the reason the box feels
// slow. Caching it lets the search bar SPECULATIVELY warm the vector on a typing
// pause (see `search.warmEmbed`) so it's usually hot by the time the user
// submits, moving the embed off the hot path. A warm hit costs one Valkey read;
// a cold miss is exactly today's cost. See docs/agentic-search-overview.md
// (Lane 1 — progressive/warm embed).
export const QUERY_EMBED_CACHE_TTL_SECONDS = 300;

// Bump when the embedding model or normalization changes so stale vectors from a
// different model can't be served.
const QUERY_EMBED_CACHE_VERSION = 'v1';

function queryEmbedCacheKey(q: string): string {
  return `qembed:${QUERY_EMBED_CACHE_VERSION}:${EMBED_MODEL}:${q
    .trim()
    .toLowerCase()}`;
}

/**
 * Embed a query with the index's model, served from Valkey when warm. On a miss
 * it embeds live (recording one `llm_call`) and populates the cache. The cache
 * key is normalized (trimmed + lowercased) so `warmEmbed` and the actual search
 * share it. Throws if the embed itself fails (a cache backend outage degrades to
 * a live embed, never an error).
 */
export async function getQueryEmbeddingCached(
  q: string,
  activity = 'searchEmbedQuery',
): Promise<number[]> {
  const key = queryEmbedCacheKey(q);
  const cached = await cacheGetJson<number[]>(key).catch(() => null);
  if (cached && cached.length > 0) {
    return cached;
  }
  const res = await createEmbeddingsTracked({
    model: EMBED_MODEL,
    input: q,
    tracking: { activity },
  });
  const vector = res.data[0]?.embedding;
  if (!vector) {
    throw new Error('Failed to embed search query');
  }
  void cacheSetJson(key, vector, QUERY_EMBED_CACHE_TTL_SECONDS);
  return vector;
}

// Minimum length for a query to be worth speculatively warming. Short queries
// are navigational (a name, a title fragment) and rarely reach the semantic
// lane, so warming them would just burn embeds per keystroke.
const WARM_MIN_LENGTH = 12;
// Operator-ish characters that mark a navigational / filter-syntax query we
// should NOT warm (quoted ids, field filters).
const OPERATOR_RE = /[":<>()]|\b(AND|OR|NOT)\b/;

/**
 * Whether a query looks like a natural-language recollection worth pre-embedding
 * on a typing pause. Conservative by design — the goal is to warm the queries
 * that will actually use the semantic lane without paying an embed for every
 * keystroke of a navigational search.
 */
export function shouldWarmEmbed(q: string): boolean {
  const trimmed = q.trim();
  return trimmed.length >= WARM_MIN_LENGTH && !OPERATOR_RE.test(trimmed);
}
