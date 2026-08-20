# Search scaling guide — tuning for the 55k+ corpus

A forward-looking companion to [`search-ranking-tuning.md`](./search-ranking-tuning.md)
(current mechanics) and [`search-preferences.md`](./search-preferences.md) (intent).
This doc is about **what to revisit when the index grows from the ~27-video seed
corpus to the full 55k+ video production set**, and *why* several knobs that are
correct today will likely need to move.

## The core caveat: today's tuning is overfit to a small, cohesive corpus

The current ranking was validated against ~27 videos from two topically adjacent
channels (_The Dorean Principle_ + _Selling Jesus_). That corpus has two
properties that **invert at scale**, so the tuning that fixes it is the wrong
default for production:

1. **Almost everything is semantically on-topic.** With a narrow corpus, the
   vector signals can't discriminate — every doc looks "about ministry money," so
   semantic similarity over-ranks and buries exact matches. The fix was to weight
   the **lexical** signal heavily (`[0.5, 0.25, 0.25]`) and add phrase boosts. At
   55k diverse videos, the semantic signal becomes *genuinely discriminating*
   again — and an over-heavy lexical weight will start under-serving good
   natural-language/semantic queries.

2. **`min_max` normalizes over a tiny candidate pool.** With few candidates per
   sub-query, one outlier compresses everything else. The distribution at scale is
   different (and changes per query), so the floor and weights calibrated against
   the seed distribution won't transfer cleanly.

**Expectation:** at scale the failure mode flips from "exact matches buried by
semantic breadth" to "good semantic matches buried by lexical over-weighting, plus
genuinely irrelevant lexical noise from a much larger haystack." Re-tune toward
semantics; don't assume the seed-corpus weights are a safe default.

## Step 0 — build a real eval harness BEFORE re-tuning (prerequisite)

Today's process is "query the live endpoint and eyeball against expectation"
(see the tuning doc's _Evaluating_ section). **That does not scale past a few
dozen videos.** Do this first, or every knob change below is guesswork:

- **Mine production query logs.** Searches are already logged (`searchLogId` /
  `recordAnswer` path). Pull the real query distribution — head terms, long-tail,
  question-shaped vs keyword, quoted vs unquoted. Tune against what users actually
  type, not invented queries.
- **Build a labeled judgment set.** A few hundred `(query → expected top
  result(s))` pairs covering the query shapes in `search-preferences.md` (exact
  title, title words, quoted phrase, unquoted phrase, rare word, NL question,
  off-topic-should-be-empty). Weight it toward real head queries from the logs.
- **Compute MRR / NDCG@10**, plus two cheap guardrails: **off-topic empty rate**
  (off-topic queries that correctly return nothing) and **known-item recall@1**
  (searching an exact title returns it at #1). Commit the harness this time — the
  tuning doc notes there isn't one; at 55k that's a liability.
- **Detect regressions structurally, not by eye.** Any pipeline/weight change runs
  the full set and reports deltas. A change that helps NL queries but tanks
  known-item recall should be visible immediately.

## Knob-by-knob: expected direction of change at scale

| Knob | Now | At 55k+ | Why |
| --- | --- | --- | --- |
| Fusion weights `[BM25, doc-kNN, para-kNN]` | `[0.5, 0.25, 0.25]` | Rebalance toward semantics, e.g. `[0.4, 0.3, 0.3]` or nearer equal | Vector signals become discriminating again; heavy lexical weight starts hurting NL queries. |
| `RESULTS_RELEVANCE_COSINE_FLOOR` | `0.25` | Recalibrate against the new cosine distribution (likely **raise**) | More content ⇒ a 0.25 cosine is more likely to be coincidental noise; the floor was fit to the seed distribution. |
| Phrase boosts (3/2 quoted, 2/1.5 implicit) | as-is | Keep or **raise** quoted; **watch** implicit `slop:2` on long queries | A verbatim multi-word match in 55k docs is a *stronger* signal than in 27; but the unquoted whole-query-as-phrase with slop can misfire on long NL questions. |
| `minimum_should_match` | `'2<70%'` | Likely fine; revisit with stopword handling | 70% with stopwords counting gets strict for long NL queries (see analyzer note below). |
| `min_max` normalization | min_max | Re-examine vs `l2`; consider per-shard effects | Per-batch relative; with more/varied candidates the compression behavior shifts. |

### Fusion weights

This is the highest-leverage knob and the one most overfit. Re-tune it **first**,
against the harness, once real query logs exist. Hypothesis to test: equal-ish
weights recover NL-query quality without regressing known-item recall (because the
phrase boost + BM25, not the fusion weight, is what wins exact matches now).

### Cosine floor / relevance gate

The `hasStrongLexicalMatch` second-chance gate (title overlap OR exact transcript
phrase) is corpus-size-robust and should keep earning its keep — distinctive rare
words still deserve to surface. But the **floor value** itself is a distribution
fit. Recompute the cosine distribution over a real query sample and pick the floor
where off-topic-empty-rate and known-item-recall trade off acceptably. Don't carry
`0.25` forward unexamined.

### Analyzer / stopwords (newly worth it at scale)

The tuning doc flags that `minimum_should_match` counts stopwords toward the total
("of" inflates the denominator), and that this is only an approximation of
content-word overlap. At seed scale that's tolerable; at 55k with many long NL
queries it's worth fixing properly:

- Add a **stop filter** (or `english` analyzer) on the `paragraphs.text` /
  `title` search analyzers so `minimum_should_match` operates on content words.
- Reindex implications: an analyzer change requires reindex. Fold it into the same
  reseed/reindex that production scale-up will need anyway — don't do it piecemeal.

### BM25 length normalization (`b`) — matters once doc lengths vary

The seed corpus is uniform (audiobook chapters + pitch videos). Production spans
2-minute clips to multi-hour sermons. BM25's `b` (default 0.75) length-normalizes;
with high length variance, long transcripts can be unfairly penalized or boosted.
If long-form content systematically under/over-ranks, tune `b` (or `k1`) on the
`paragraphs.text` field. Validate on the harness — don't eyeball.

## New concerns that simply didn't exist at 27 videos

These are not "re-tune a value" — they're whole categories that only bite at scale.

### kNN recall & latency (the big one)

55k videos × many paragraphs each = potentially **millions of nested paragraph
vectors** in `lc_media_v1` (faiss HNSW, 1536-dim, `cosinesimil`). At that size:

- **`ef_search`** (HNSW query-time breadth) and the per-query **`k`** /
  `num_candidates` are now real recall-vs-latency knobs. Defaults that are
  invisible at 27 vectors will under-recall or blow latency at millions. Measure
  recall@k against an exact (brute-force) baseline on a sample.
- **`expand_nested_docs` + nested kNN cost** scales with paragraph count per doc.
  Watch p95 latency on long videos.
- **Memory**: faiss HNSW graphs are RAM-resident. 1536-dim × millions of vectors
  is a sizing input for the OpenSearch nodes — budget it before reindex, not after
  it OOMs.
- Consider whether **doc-level** kNN (one vector/video) carries enough of the load
  that paragraph-level kNN `k` can be kept small for latency.

### Index / shard sizing & ingest

- Pick a **shard count** for `lc_media_v1` sized to the full corpus (target
  ~10–50GB/shard), not the seed. Resharding later means reindex.
- During the bulk backfill, raise `refresh_interval` (e.g. `30s`/`-1`) and restore
  it after; **force-merge** read-heavy segments post-backfill for query speed.
- `lc_media_v1` only indexes uploads that already have summary embeddings
  (post-LLM pipeline). At 55k, the embedding backfill is itself a pipeline job —
  search quality is gated on it completing, so track coverage (% of uploads with
  `searchSummaryEmbedding`).

### `min_max` is per-batch — and facets run separate queries

Two existing wrinkles that get more pronounced at scale (already noted in the
migration doc, repeated here because they interact with tuning):

- Normalized scores are **relative to the returned candidate set per sub-query**,
  so absolute score thresholds don't transfer across queries. The cosine *gate*
  uses the raw kNN probe (`runMediaKnnProbe`), not the normalized pipeline score —
  keep it that way; don't gate on post-normalization scores.
- The leave-one-out facet aggregations issue **parallel `osSearch` calls**
  because the `_msearch` metadata header can't carry `search_pipeline`. At 55k
  that's N extra full hybrid queries per search — watch the facet fan-out cost and
  consider caching facet counts or narrowing which facets recompute per keystroke.

## Rollout / validation discipline

- **Pipeline changes don't need a reseed.** `PUT /_search/pipeline/lc-media-rrf`
  with the new body updates a running cluster live (see tuning doc). Weight/fusion
  re-tuning is therefore cheap to iterate — but always run the harness before and
  after.
- **Analyzer/mapping/shard changes DO need reindex.** Batch them: do the
  stopword analyzer, any field/shard changes, and the embedding-coverage backfill
  in one planned reindex, not several.
- **Shadow or A/B at scale.** With real traffic, prefer comparing
  candidate rankings against the live one on logged queries (offline replay)
  before flipping, rather than tuning live.
- **Re-confirm the licensing constraint still holds** if any of this tempts a move
  to a managed/paid feature: relevance must stay on free/non-enterprise tiers
  (`normalization-processor` is free on OpenSearch; the ES equivalent is the free
  Basic `linear` retriever — ES *RRF* is the Platinum-gated one). See
  `search-preferences.md` constraints.

## Quick triage at scale: symptom → first knob to check

| Symptom | Look at |
| --- | --- |
| Good NL/question queries return weak results | Fusion weights too lexical — rebalance toward kNN |
| Exact-title search doesn't return the item at #1 | Phrase boost / known-item recall; analyzer change broke tokenization |
| Lots of off-topic results leaking through | `RESULTS_RELEVANCE_COSINE_FLOOR` too low for the new distribution |
| Distinctive rare word returns nothing | `hasStrongLexicalMatch` gate path; floor gating it off |
| Snippets full of common-word noise | `minimum_should_match` / missing stop filter |
| Long videos systematically over/under-rank | BM25 `b` length normalization |
| Slow queries / high p95 | kNN `ef_search` / `k`, facet fan-out, shard sizing |
| Results feel inconsistent query-to-query | `min_max` per-batch relativity — expected; don't gate on normalized scores |

## TL;DR

1. Build the eval harness from real query logs **before** touching knobs.
2. Re-tune **fusion weights** toward semantics first — they're the most overfit.
3. Recalibrate the **cosine floor** against the new distribution.
4. Add a proper **stop filter** (fold into the scale-up reindex).
5. Treat **kNN recall/latency, shard sizing, and embedding coverage** as new,
   first-class concerns — they were free at 27 videos and aren't at 55k.
6. Keep all ranking in OpenSearch, keep it on free tiers, validate with the harness
   not by eye.
