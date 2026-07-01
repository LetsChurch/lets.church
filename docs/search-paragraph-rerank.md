# Paragraph-level semantic reranking (exact cosine, no ANN graph)

## Problem

`lc_media_v1` stores three faiss/HNSW `knn_vector` fields — `summaryEmbedding`,
`searchSummaryEmbedding`, and the **nested `paragraphs.embedding`** (one vector
per transcript paragraph). Querying a field with a `knn` clause makes faiss load
that field's HNSW graph into **off-heap native memory**. The paragraph graph is
~100 GB resident across the corpus (~7.86 M nested docs), so every hybrid search
that hit the nested paragraph `knn` OOM-killed the OpenSearch pod (exit 137) —
even at a 24 Gi container limit. Heap tuning doesn't touch it; it's native memory.

## Approach: retrieve → exact-cosine rerank

Instead of approximate ANN over the paragraph graph, we do a two-stage search
(`runMediaHybridSearch` in `packages/opensearch/src/media-search.ts`):

1. **Retrieve** a candidate pool (`RERANK_POOL = 60`) with the stage-1 hybrid:
   BM25 lexical + document-level `searchSummaryEmbedding` kNN, fused by the
   `lc-media-rrf` normalization pipeline. (Doc-level graphs are tiny — one vector
   per upload — so they load fine.) A third `match_none` slot keeps the 3-weight
   pipeline valid without a cluster-side migration.

2. **Rerank** the pool by each doc's best paragraph's **exact cosine** to the
   query, computed in a `script_score` (`PARAGRAPH_COSINE_SCRIPT`). `script_score`
   reads raw vectors from doc-values and **never loads the HNSW graph**, so it
   **cannot OOM**. Cost is bounded by the pool size (~20 ms to score 60), not the
   corpus. Paragraphs shorter than `RERANK_MIN_PARAGRAPH_SECONDS` (5 s) are
   skipped — degenerate one-word turns ("Grace.") score perfect cosine but are
   noise. The paragraph-cosine order is RRF-fused with the stage-1 order at
   `RERANK_W_STAGE1 : RERANK_W_PARAGRAPH = 1:2`.

Reranking runs only for relevance order (not date sort) and only for pages within
the pool (`from + size <= RERANK_POOL`); deeper pages fall back to stage-1 order.

**Snippets** (`buildMediaSnippetBody`) are fetched for the returned page only and
carry two nested inner_hits, merged by `mergeParagraphSnippets`: a lexical BM25
snippet (`para_bm25`, `<mark>`-highlighted) and a semantic best-cosine snippet
(`para_knn`, via the same `script_score`) so docs pulled in on meaning still show
their relevant moment.

## Why not the alternatives

Evaluated offline (LLM-judged nDCG@5 over 16 queries spanning title / concept /
content / term types):

| Config | nDCG@5 |
| --- | --- |
| baseline (stage-1 only) | 0.67 |
| **+ paragraph cosine (1:2)** | **0.735** |
| + paragraph cosine (1:1) | 0.72 |
| + summary-embedding exact cosine | ≈ baseline |
| + title embeddings | ≤ +para (drags it down) |

- **Doc-summary exact-rescore** adds ~nothing — it's redundant with the ANN
  summary signal already in stage-1.
- **Title/description embeddings** did not help, so titles need **no reindex**.
- **Reindex (on_disk / byte quantization) to restore ANN paragraph kNN** would
  add corpus-wide *recall* (surface a doc found only via a matching passage, not
  in the stage-1 pool). Exact rerank can't do that — it only reorders the pool.
  Given stage-1's breadth that tail is small; revisit only if recall gaps appear.

## Tuning knobs

All in `media-search.ts`: `RERANK_POOL`, `RERANK_MIN_PARAGRAPH_SECONDS`,
`RERANK_RRF_K`, `RERANK_W_STAGE1`, `RERANK_W_PARAGRAPH`. The eval harness lives in
the session scratchpad (`eval_full.py`, `eval_weights.py`): stage-1 + signal
collection against prod OpenSearch, LLM-judged relevance, nDCG per fusion config.
