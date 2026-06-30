# Elasticsearch → OpenSearch migration

## Why

Reciprocal Rank Fusion (RRF) is required for the new hybrid media search, but on
Elasticsearch it's a **license-gated (Platinum) feature** — Basic returns
`security_exception: current license is non-compliant for [Reciprocal Rank
Fusion (RRF)]`, and that gating is unchanged through ES 8.18 / 9.0. OpenSearch
ships RRF for free (the `score-ranker-processor`, OpenSearch ≥ 2.19). We run
**OpenSearch 3.6.0**.

## What changed (code)

- **Client**: `@elastic/elasticsearch` → `@opensearch-project/opensearch` in
  `packages/opensearch`. Built from `OPENSEARCH_URL` with *optional* basic
  auth + TLS (`OPENSEARCH_USERNAME` / `OPENSEARCH_PASSWORD` /
  `OPENSEARCH_SSL_REJECT_UNAUTHORIZED`) — unset in dev (security off), set in
  prod if security is enabled.
- **Transport shape**: OpenSearch puts the request under `body` and returns
  `{ body, ... }`. Two thin wrappers — `osSearch()` and `osMsearch()` — hide
  this and return the flattened response body, so existing zod schemas and
  consumers stay (mostly) unchanged. Consumers swapped `client.search/msearch`
  → `osSearch/osMsearch`.
- **Vectors**: `dense_vector` → `knn_vector` (`dimension: 1536`,
  `space_type: cosinesimil`, `method: { name: hnsw, engine: faiss }`) and the
  `lc_media_v1` index gets the static setting `index.knn: true`.
- **kNN queries**: ES `knn` (field/query_vector/num_candidates) → OpenSearch
  `knn` query (`{ field: { vector, k, filter } }`). Related-media kNN in
  `media.ts` updated; hybrid builder rewritten.
- **Hybrid + RRF**: `media-search.ts` now builds an OpenSearch `hybrid` query
  (BM25 + doc kNN + nested paragraph kNN with `inner_hits` + `expand_nested_docs`)
  and runs it with `search_pipeline=lc-media-rrf`. The pipeline (a
  `score-ranker-processor` with `technique: rrf`) is created in `mappings.ts`.
  **Update:** the pipeline has since moved from RRF to score-normalized fusion
  (`normalization-processor`, min_max + weighted mean) — see
  [`search-ranking-tuning.md`](./search-ranking-tuning.md). The `lc-media-rrf`
  id is kept as-is.
- **Infra**: `docker-compose.yml` runs `opensearchproject/opensearch:3.6.0`
  (service `opensearch`). The security plugin is **disabled in dev**
  (`DISABLE_SECURITY_PLUGIN=true`), so the cluster serves plain HTTP with no
  auth — matching the prior ES setup and the `http://opensearch:9200` URL. The
  client still reads optional
  `OPENSEARCH_USERNAME`/`OPENSEARCH_PASSWORD`/`OPENSEARCH_SSL_REJECT_UNAUTHORIZED`,
  so security can be re-enabled in production via env without code changes.

## Bring-up / runtime steps (not yet executed — needs a running cluster)

1. **Security is disabled in dev** (`DISABLE_SECURITY_PLUGIN=true`), so there's
   no password/TLS to configure — the cluster is plain HTTP on 9200. (For
   production, enable security and set the client's `OPENSEARCH_USERNAME` /
   `OPENSEARCH_PASSWORD` / `OPENSEARCH_SSL_REJECT_UNAUTHORIZED` env.)

2. **Host kernel setting.** OpenSearch needs `vm.max_map_count >= 262144`.
   - Linux: `sudo sysctl -w vm.max_map_count=262144` (persist in
     `/etc/sysctl.conf`).
   - Docker Desktop (macOS/Windows): usually already sufficient.

3. **Drop the old data volume.** `es-data` holds Elasticsearch Lucene data that
   OpenSearch cannot read. Remove it before first start:
   `docker compose down -v` (or `docker volume rm <project>_es-data`).

4. **Start the cluster.** `docker compose up -d opensearch` and wait for the
   healthcheck (plain HTTP `/_cluster/health`) to pass. Dashboards:
   `opensearch-dashboards` on `HOST_KIBANA_PORT` (no login — security disabled).

5. **Push mappings + create the RRF pipeline.**
   `pnpm --filter @letschurch/opensearch push-mappings`. This creates all
   `lc_*` indices (with `knn_vector` + `index.knn` on `lc_media_v1`) and PUTs the
   `lc-media-rrf` search pipeline. Run it where `OPENSEARCH_URL` + credentials
   point at the cluster (inside the compose network, or from the host with
   `HOST_OPENSEARCH_URL`).

6. **Reindex all content.** The indices start empty. Repopulate via the existing
   reindex path (`packages/temporal/.../reindex`) for every kind:
   `upload`, `transcript`, `channel`, `organization`, and `media`. Note
   `lc_media_v1` (`media`) only indexes uploads that already have summary
   embeddings (post-LLM pipeline); legacy/un-summarized uploads are skipped.

## Verify

- Pipeline exists: `GET /_search/pipeline/lc-media-rrf`.
- kNN works: `lc_media_v1` mapping shows `knn_vector` + `index.knn: true`.
- Hybrid search returns fused results (BM25 ∪ vector) with paragraph
  `inner_hits` — exercise the example queries (e.g. "love tank" → "love cup").
- Existing BM25 search (`performSearch`, church/ministry search) still works
  through `osMsearch`.

## Not validated here / watch for

This migration was written without a running OpenSearch 3.6.0 to test against.
Validate the exact JSON against the live cluster; if any of these differ by
version, adjust:

- `score-ranker-processor` body shape (`combination.technique: rrf`,
  `rank_constant`) in `mappings.ts`.
- `hybrid` query `pagination_depth` and per-sub-query `filter` placement in
  `media-search.ts`.
- `knn` query `filter` / `expand_nested_docs` placement for nested vectors.
- faiss `cosinesimil` availability (vs `lucene` engine) for 1536-dim vectors.
- **`search_pipeline` is NOT honored in the `_msearch` metadata header** on
  3.6.0 — it 400s with `key [search_pipeline] is not supported in the metadata
  section`. So any query that needs the RRF pipeline (i.e. every `hybrid` query)
  must run as its own `_search` with `?search_pipeline=…`, not batched into an
  `osMsearch`. The leave-one-out facet aggregations in `runMediaFacets` issue
  parallel `osSearch` calls for this reason (see the comment there). (An unpiped
  `hybrid` query in `_msearch` does run and yields correct aggregations — they're
  score-independent — but returns unnormalized `_score`s, so don't rely on it.)

## Production notes

Dev runs with the security plugin **disabled** (plain HTTP, no auth). For
production, enable the security plugin and configure the client via env:
`OPENSEARCH_URL=https://…`, `OPENSEARCH_USERNAME` / `OPENSEARCH_PASSWORD`
(a dedicated least-privilege user, not `admin`), and
`OPENSEARCH_SSL_REJECT_UNAUTHORIZED=true` with real certificates. No code
change required — the client already reads these.
