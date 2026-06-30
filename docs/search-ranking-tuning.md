# Search ranking tuning

How `lc_media_v1` hybrid search is ranked, the problems we hit, and the knobs to
turn. Builds on [`opensearch-migration.md`](./opensearch-migration.md) (which
set up the hybrid query) and supersedes its fusion section: we moved off plain
RRF to **score-normalized fusion**.

## The retrieval shape

Hybrid search over `lc_media_v1` fuses three sub-queries
(`buildMediaHybridBody` in `packages/opensearch/src/media-search.ts`):

1. **BM25 lexical** — `multi_match` over `title^2 / description / summary /
   channelName`, plus a nested `match` over `paragraphs.text` (surfaces matched
   paragraphs via `para_bm25` inner_hits, with `<mark>` highlighting).
2. **Doc-level kNN** over `searchSummaryEmbedding` — "is this video about the
   thing you asked for".
3. **Paragraph-level kNN** over nested `paragraphs.embedding` — "which moment
   matches" (`para_knn` inner_hits, `expand_nested_docs`).

They're combined in the `lc-media-rrf` search pipeline (defined in
`mappings.ts`). The query vector is a request-time `text-embedding-3-small`
embedding of the raw query.

> Naming wart: the pipeline constant is still `RRF_PIPELINE` / id `lc-media-rrf`
> even though it no longer uses RRF. Left as an opaque identifier to avoid a
> reindex/rename churn.

## Why RRF wasn't enough

The original pipeline used OpenSearch's `score-ranker-processor` (RRF). **RRF
fuses by _rank_ and discards score magnitude.** A document that is #1 in BM25 by
a 4× margin looks identical to one that's #1 by a hair, so a strong exact/phrase
match repeatedly lost to a merely-semantically-broad result.

Concrete failure (the corpus is small + topically cohesive — _The Dorean
Principle_ audiobook + _Selling Jesus_ satire — so almost everything is on-topic
semantically, which makes this acute):

- Query `large body of christian literature`: only **Foreword** contains that
  exact phrase (BM25 19.1 vs the next doc's 5.1), yet it ranked **8th** because
  _Christian Books Pitch Meeting_ won both vector signals and RRF let that
  outweigh the lexical blowout.

## What changed

All ranking lives in OpenSearch — there is **no Node-side re-rank**.

### 1. Score-normalized fusion (`mappings.ts`)

Swapped `score-ranker-processor` (RRF) → `normalization-processor`:

```
normalization: { technique: 'min_max' }
combination:    { technique: 'arithmetic_mean', parameters: { weights: [0.5, 0.25, 0.25] } }
```

`min_max` normalizes each sub-query's scores to `[0,1]`; the weighted mean then
preserves magnitude, so a decisive lexical win carries through. Weights map to
the sub-queries in order — **`[BM25, doc-kNN, paragraph-kNN]`** — with lexical
weighted highest so exact/phrase/title matches rank where users expect.

This is free on OpenSearch (same Apache-2.0 neural-search family as the RRF
processor). On Elasticsearch the equivalent is the `linear` retriever
(min_max/l2 + weights), GA in the **free Basic** license as of 8.18 / 9.0 — note
ES's _RRF_ retriever is the Platinum-gated one (see migration doc).

### 2. Phrase-proximity boost (`buildMediaHybridBody`)

A `match` is OR-over-tokens, so an exact phrase gets no special reward. We add a
`match_phrase` boost in the BM25 signal:

- **Explicit quoted phrases** → exact `match_phrase` (title boost 3, paragraph
  boost 2, slop 0). Quotes round-trip through TanStack Router because it
  JSON-encodes the `q` param (`"foo"` → `q="\"foo\""`), and `extractQuotedPhrases`
  recovers them.
- **Unquoted multi-word queries** → the whole query as an _implicit_ phrase with
  `slop: 2` and lighter boosts (2 / 1.5), so an exact phrase nudges up without
  being forced.

### 3. `score_mode: avg → max` on the nested BM25 match

Score a doc by its single best-matching paragraph, not the average — otherwise
one paragraph that nails the query is diluted by the doc's many weak matches.

### 4. `minimum_should_match: '2<70%'` on the nested BM25 match

`match` is OR-over-tokens, so any paragraph containing a single common word
("of") matched and flooded the snippet list. The combined `2<70%` rule scales
the floor with query length: **1–2 word queries require all terms** (a bare
percentage would `floor()` to 1 and let single-token matches back in), **3+ word
queries require 70%** (5 words → 3, 10 → 7). Caveat: stopwords count toward the
total, so it's an approximation of content-word overlap — true stopword removal
is the only way to not count "of". This is purely about which paragraphs count
as matches (and thus show as snippets); BM25's IDF already near-zeroes
stopword-only matches for _ranking_. The same rule gates the title check in
`hasStrongLexicalMatch`.

### 5. Lexical-aware relevance gate (`hasStrongLexicalMatch` + `search.ts`)

The results gate suppresses the whole list when the top doc-kNN cosine is below
`RESULTS_RELEVANCE_COSINE_FLOOR` (0.25) — "nothing on-topic, don't show noise".
But a rare, distinctive word can be a genuine match yet semantically isolated:
`colabor` (a chapter title) scored cosine **0.198** and returned **zero
results**.

Fix: when the cosine is about to gate, run a second, cheap BM25-only check —
does the query overlap a **title** (`match` with `'2<70%'`) or appear **verbatim**
in a transcript (`match_phrase`)? If so, keep the results. Deliberately strict
(title overlap OR exact phrase, not a loose OR-token match) so genuinely
off-topic queries — which the floor _should_ suppress — don't slip through.

### 6. Snippet display (`mergeParagraphSnippets`)

Not ranking, but related: each result leads with its single strongest-matching
paragraph (OpenSearch returns inner_hits in score order), then the rest in
chronological order, capped at 25. The results call requests `innerHitsSize: 25`
(BM25, so "show more" reveals all real matches) and `knnInnerHitsSize: 3` (keep
the semantic snippets to a few best moments).

## Tuning knobs

| Knob | Where | Effect |
| --- | --- | --- |
| Fusion weights `[BM25, doc-kNN, para-kNN]` | `mappings.ts` pipeline | Raise weight 0 to favor lexical/exact; raise 1–2 to favor semantics. |
| `RESULTS_RELEVANCE_COSINE_FLOOR` (0.25) | `search.ts` | Higher = suppress more loosely-related queries. |
| Phrase boosts (3/2 quoted, 2/1.5 implicit) | `buildMediaHybridBody` | Strength of exact/phrase preference. |
| `minimum_should_match` (`'2<70%'`) | `buildMediaHybridBody` | Strictness of paragraph matching / snippet noise. |
| `innerHitsSize` / `knnInnerHitsSize` | `search.ts` call | How many snippets per result. |

**Applying a pipeline change:** the pipeline is created by `mappings.ts` (run on
seed/deploy). To update a running cluster without a reseed, `PUT
/_search/pipeline/lc-media-rrf` with the new body directly.

## Evaluating

There's no committed harness; tuning was done by querying the live endpoint and
eyeballing against expectation. To reproduce: hit
`GET /trpc/search.hybridSearch?batch=1&input=<urlencoded {"0":{"json":{"q":"…","limit":8,"skipLogging":true}}}>`
and read `result.data.json.items[].title`. Pass quotes inside `q` (e.g.
`"the dorean principle"`) to exercise the quoted path. For lexical-only debugging,
query OpenSearch directly with the BM25 `should` clauses and inspect `_score`.

Use a spread of query shapes: exact title words, multi-word titles, quoted
phrases, unquoted phrases, single rare words (e.g. `colabor`), natural-language
questions, and deliberately off-topic queries (which should return nothing).

## Known limitations

- **Purely-semantic queries with no lexical anchor** (e.g. `tentmaking`,
  `selling prayer`) lean entirely on the vector signals, where the broad
  "ministry money" content can pull. Weights can't fix these — there's no
  lexical hook to reward.
- **`min_max` is per-batch relative**: scores are normalized over the returned
  candidates per sub-query, so a single outlier compresses the rest. Far better
  than rank-only for our case, but it's not absolute confidence.
- Tuning was validated against the current small seed corpus; re-check the knobs
  if the corpus grows substantially more diverse.
