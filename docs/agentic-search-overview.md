# Agentic search — instant lexical box + a streamed "dig deeper" overview

Status: **implemented** (on the `kyrios` line) except where noted below.
Supersedes the parallel-Qdrant experiment (see
[Engine decision](#engine-decision-opensearch-drop-the-go--qdrant-service)).

## What shipped

- **Windows in OpenSearch** — nested `windows` field on `lc_media_v1`
  (`packages/opensearch/src/mappings.ts`); built + embedded at ingest
  (`packages/temporal/src/util/windows.ts`, wired into `index-document.ts`); an
  exact-cosine window rerank signal RRF-fused alongside the paragraph signal and
  a contiguous-span snippet (`buildWindowCosineBody`, `rerankByCosineSignals`,
  `windowSpanSegment`/`mergeSnippets` in `media-search.ts`). Default lane is
  `script_score`-only — no window ANN graph is loaded, so no OOM. **Requires a
  reindex** to populate windows.
- **Warm/speculative query embed** — `getQueryEmbeddingCached` + the
  `search.warmEmbed` procedure, fired on a debounce from the search bar
  (`use-warm-query-embed.ts`), so the ~226 ms embed leaves the hot path.
- **The recollection gate + agentic detective loop** — `/api/search-answer`
  evolves into a gated dig path: `recollectionGate` / `classifyRecollection`
  (`ai/answer-gate.ts`) decide dig vs the cheap summarize, with a manual
  "dig deeper" override. The loop uses multi-strategy tools — exact-quote
  `grepTranscript` (a case-insensitive substring match over the
  `paragraphs.text.wildcard` OpenSearch multi-field — `grepParagraphs` in
  `@letschurch/opensearch`; no Postgres/pg_trgm), the hybrid
  `searchMedia`, and the §2a on-demand semantic `recallWindows`
  (`runWindowKnnRecall` — the one place a window `knn` runs) — under
  `DETECTIVE_INSTRUCTIONS`, streaming its reasoning on a separate channel
  (`ai/answer-stream.ts`, rendered by `answer-panel.tsx`).

## Deferred (not in this change)

- **Abuse controls** — rate limit / daily spend cap / proof-of-work
  ([abuse doc](./search-answer-abuse-mitigation.md)) remain a TODO at the top of
  `search-answer.ts`. The endpoint is still unauthenticated and expensive.
- **§2b quantized/`on_disk` window ANN field** — only if eval shows §2a recall
  gaps.
- **Two-query progressive first paint** (BM25 first, reranked fold-in a beat
  later) — the warm embed covers the "instant box" for now; the `search.tsx`
  split is a follow-up.

## TL;DR

Split search into two lanes with different latency budgets:

1. **The search box is instant and lexical.** BM25 (+ the cheap exact-cosine
   rerank we already run) on submit, results in well under the query-embed cost.
   No blocking OpenAI round-trip on the hot path. This is the navigational path —
   "I roughly know what to type."
2. **An AI overview owns everything expensive and semantic.** It reads the query
   and the instant results, *decides* whether they're good enough, and when they
   aren't it runs an **agentic detective loop** — query embedding, semantic
   window recall, phrase grep, self-correction — **while streaming its reasoning**.
   The ~226 ms embed and the multi-second loop happen inside a pane that is
   already streaming tokens, so they read as "watching it work," not latency.

Engine: **OpenSearch, single engine.** Drop the parallel Go/Qdrant service.
Windows (story-run spans) become a nested field on the media doc. Lean on the
search engine for grouping, fusion, and faceting instead of doing it in a
bespoke service.

## Why this shape

The [OS-vs-Qdrant diff harness](#appendix-what-the-harness-told-us) established
the load-bearing fact: **the query embedding (~226 ms, an OpenAI round-trip) is
the single biggest cost in every search** — bigger than either search engine.
Search feels slow because we *serialize a network embed in front of rendering
anything*, not because retrieval is slow.

The naive fix — "stop embedding the query" — throws away the one capability this
whole line of work was built for. The motivating query,
[recorded in `todo.ignore.md`](#the-motivating-case), was a half-remembered
story: a grandmother recounting her granddaughter asking two missionaries at the
door *"is it true you're not allowed to talk to us?"* — remembered as **Jehovah's
Witnesses**, actually **Mormon missionaries**. That query shares no keywords with
the transcript; only a semantic (embedded) query can find it. Removing the embed
removes the feature.

So the move is to **relocate** the embed, not delete it. A blank result list is
the only place 226 ms hurts. An answer pane that streams reasoning over several
seconds is a place where a 226 ms embed — and even a multi-second retrieval loop —
is invisible, because the user is already reading. Perceived latency inverts.

## Engine decision: OpenSearch, drop the Go / Qdrant service

We ran a real experiment: a self-contained Go `services/search` backed by Qdrant,
selectable per-request via `?backend=qdrant`, indexing in parallel with
OpenSearch. It answered its question and should now be **removed**, not shipped.

| | OpenSearch (keep) | Qdrant + Go service (drop) |
| --- | --- | --- |
| Facets | **Native single-request aggregations** (channel / year / book / speaker / verse) | Returned **empty** speaker/verse facets — parity is unbuilt work |
| Hybrid fusion | BM25 + doc-summary-kNN + exact-cosine rerank, tuned (`lc-media-rrf`, [rerank doc](./search-paragraph-rerank.md)) | **Dense-only today**; missed keyword-obvious titles in the harness. Reaching parity = rebuild fusion |
| Grouping / snippets | Native nested `inner_hits`, field collapse | Grouped by `mediaId` **in Go** — the reason the service exists |
| Relevance gate, sort, citations | Already implemented + tuned | Re-implement |
| Process RSS (aomin) | 2.46 GiB — but a **fixed 2 GiB heap only 16% used** (headroom, not pressure) | 464 MiB (~5× smaller) |
| Engine p50 | ~260 ms | ~156 ms |
| Operational surface | One engine already in prod | A second engine + a second embedding path + dual indexing |

**The decision.** Once we "lean on the search engine" — let OpenSearch do
grouping (nested `inner_hits` / collapse), fusion (`lc-media-rrf`), and faceting
(native aggregations) — the entire justification for a bespoke Go service
("do all data processing except SQL reads in Go") evaporates. Keeping Qdrant
means *more* work (wire lexical fusion it doesn't have, build facet parity it
lacks) to reach where OpenSearch already is, in exchange for a memory win that is
**smaller than it looks**: OpenSearch's headline RSS is a pre-committed heap, and
we deliberately avoid the one thing that would blow up its native memory — the
~100 GB paragraph HNSW graph — by exact-cosine `script_score` reranking that
never loads a graph ([rerank doc](./search-paragraph-rerank.md)). The only ANN
graph we load is the tiny doc-summary one (one vector per upload).

**Honest tradeoff + escape hatch.** Qdrant genuinely uses less RAM and is a bit
faster per query. If, at the [55k+ corpus](./search-scaling-guide.md), memory
becomes the *binding* constraint, Qdrant is the proven challenger to bring back.
That is a future, deliberate migration — not a reason to run two engines now.
Keep the search layer abstracted behind `runMediaHybridSearch` so re-introducing
an alternative engine stays contained.

### What gets removed

- `services/search/` (Go), the `qdrant` + `search-service` compose services, the
  `qdrant-data` volume, `SEARCH_SERVICE_URL`.
- `packages/web/src/trpc/search/qdrant.ts`,
  `packages/temporal/src/util/search-service.ts`.
- The `backend` and `windowsOnly` query params (`hybridSearchSchema`,
  `search.tsx` URL plumbing).
- The reindex `target` selector (`admin.ts`, `admin_.reindex.tsx`), the
  `qdrantDoc` POST in `index-document.ts`, and the Qdrant delete-sync in
  `delete-upload-record.ts`.

The **window** idea survives the Go service — it just moves into OpenSearch.

## Windows in OpenSearch

"Windows" are the story-run unit: rolling 4-paragraph, stride-2 spans, their
concatenated text embedded, so a story that spans several paragraphs is
retrievable as one coherent thing (the L3 recall case). They move from a Qdrant
collection to a **nested field on the `lc_media_v1` media doc**, alongside the
existing nested `paragraphs`.

```
windows: {                      // nested
  startOrder, endOrder,         // paragraph range, for snippet reconstruction
  start, end,                   // seconds
  embedding: knn_vector(1536),  // exact-cosine reranked (script_score), NOT ANN by default
}
```

Windows serve two distinct jobs; keep them separate because they have different
memory profiles:

**1. Span rerank + contiguous snippets (default lane, memory-safe).** Add a
window exact-cosine `script_score` signal to the existing rerank, RRF-fused
alongside the paragraph-cosine signal. Like the paragraph rerank, `script_score`
reads raw vectors from doc-values and **never loads an HNSW graph**, so it cannot
OOM and costs are bounded by the candidate pool, not the corpus. Payoff, straight
from the harness: paragraph snippets are scattered non-contiguous best-cosine
paragraphs (e.g. orders `[66, 79, 78]`); a winning window yields a **contiguous
span** (`[280, 281, 282, 283]`) that reads as a coherent passage. This is the old
`windowsOnly=true` behavior, now just a snippet source inside OpenSearch.

**2. Recall for keyword-free stories (the hard case) — but *not* a default
cluster-wide ANN graph.** Exact-cosine rerank only *reorders the stage-1 pool*;
it cannot pull in a media that stage-1 (BM25 + doc-summary-kNN) never retrieved.
The granddaughter story is exactly that failure: no shared keywords, and a
2-hour video's summary may not mention a 90-second anecdote, so doc-summary-kNN
can miss it too. Fixing this in the deterministic query would mean an **ANN kNN
over window vectors** (~378 k for aomin) — a native-memory HNSW graph, the thing
we spent real effort avoiding. Options, in preference order:

- **(a) Don't build a default window ANN graph.** Keep the deterministic query
  memory-safe (exact rerank only). Let the **agent** cover the recall tail — it
  can issue a targeted semantic window query (even an expensive `on_disk` /
  PQ-quantized kNN) *per query, when it decides it's needed*, paying that cost
  visibly and occasionally rather than baking it into cluster memory forever.
  **This is the recommended default** and the architectural through-line of this
  doc: the agentic lane *is* how we afford recall without paying for it always.
- **(b) A quantized/`on_disk` window kNN field** for corpus-wide recall if
  evaluation shows the deterministic pool misses too many good stories even with
  the agent. Windows quantized (the L3 worktrees used faiss PQ 32×) at ~378 k
  vectors is a fraction of the 7.86 M-paragraph full-precision graph that OOM'd —
  bounded, but still native memory to budget. Revisit only if [recall gaps
  appear](./search-paragraph-rerank.md#why-not-the-alternatives).

**Do we still need paragraph vectors?** (The original ponder.) Yes, for now —
they give pinpoint per-moment snippets and the paragraph-cosine rerank signal
that measurably lifted nDCG. Windows give story-run recall + contiguous snippets.
They are complementary, and because both are exact-cosine `script_score` (no
graph), storing both costs doc-values + rerank compute, not native ANN memory.
Dropping paragraph vectors for the ~⅔ vector reduction stays a separate,
later, index-time decision — not part of this design.

## The two lanes

### Lane 1 — the instant box (deterministic)

On submit, run the current `runMediaHybridSearch` **without** waiting on a fresh
query embedding for first paint:

- BM25 lexical + doc-summary-kNN stage-1 (doc-summary-kNN uses the tiny per-upload
  graph, which loads fine), fused by `lc-media-rrf`.
- Exact-cosine paragraph + **window** rerank of the pool (`script_score`).
- Native aggregations for facets; the relevance gate as today.

This renders fast and is fully useful on its own. It is also the **input** the
overview reads, so the agent never starts from nothing.

> Latency note: the exact-cosine rerank needs the query vector, so strictly the
> instant lane still wants an embed. Two ways to keep it off the critical path,
> both cheap: **(i) render the BM25 + facet results first and fold the reranked
> order in a beat later** (progressive), and/or **(ii) speculatively kick off the
> embed on a debounce pause while the user is still typing**, so the vector is
> usually warm by the time they submit. Either keeps the box feeling instant; the
> embed stops being a blocking prefix.

### Lane 2 — the streamed overview (agentic)

The overview is an evolution of the existing `/api/search-answer` Mastra agent
(nano query parser + ES/DB tools + streamed generation, `maxSteps: 8`). It reads
the query + Lane-1 results and either **summarizes what's already there** (cheap,
often no extra retrieval) or **digs deeper** (the detective loop below), narrating
as it goes.

## The gate — when to dig

Digging costs an LLM turn + an embed + possibly a retrieval loop, so it must be
gated. Never pay it on navigational searches:

- **Skip the overview entirely** for short / operator-y / navigational queries
  (few tokens, quoted-id-like, filter syntax) → pure instant search, zero extra
  cost.
- **Trigger the overview** when the query is a *recollection*: a natural-language
  sentence or question, no operators — **or** when Lane-1's top score is below the
  [relevance floor](./search-ranking-tuning.md) (the instant results are thin).
  Those are the signals the user wants a concept, not a keyword.
- **Manual override:** a "dig deeper" / "search by meaning" affordance always
  available, for when the heuristic doesn't fire but the user knows they want it.

Start with a conservative heuristic gate (cheap, deterministic) and a nano-model
tie-breaker only for ambiguous cases; tune against logs. When in doubt, *don't*
auto-dig — the manual button is the safety valve, and unnecessary digs cost money.

## The agentic detective loop

This productizes the manual process that actually located the granddaughter
story from a partially-wrong recollection. Encode these heuristics
(from `todo.ignore.md`):

- **Weight a remembered near-verbatim QUOTE far above swappable LABELS.**
  Denomination, names, dates, places are low-confidence — memory substitutes
  them. The quote *"is it true you're not allowed to talk to us?"* is the anchor;
  "Jehovah's Witnesses" is a guess.
- **Treat mismatches as signal, not noise.** When "granddaughter + JW" surfaces
  only Mormon content, that *is* the tell the denomination is wrong — pivot, don't
  force it.
- **Multi-strategy retrieval + convergence.** Run in parallel and reconcile:
  - exact substring grep on the distinctive quoted string (case-insensitive
    `*phrase*` over the `paragraphs.text.wildcard` OpenSearch multi-field);
  - BM25 (lexical);
  - semantic **window** recall (the story shares no keywords — the L3 case; this
    is the deliberate, gated, possibly `on_disk`-kNN move from
    [Windows §2a](#windows-in-opensearch)).
- **Loop:** generate candidate queries → search across strategies → detect
  contradictions → relax the low-confidence terms → re-query → **confirm by
  reading neighboring paragraphs** → report the *correction* back to the user.

The output is not just a ranked list — it's a **converged answer with a
correction**, e.g.:

> "The keyword matches for *Jehovah's Witnesses* look thin. But your remembered
> quote is near-verbatim, and I weight that above the label — that line actually
> comes from a story about **Mormon missionaries**. Here's the moment →"

That experience is impossible in a blocking search box and is the whole point of
Lane 2.

## Streaming UX

- **Invariant: render Lane-1 results FIRST, always.** The overview must never
  delay the instant list. If the agent stalls or the LLM is slow, the user
  already has results. This is non-negotiable ordering.
- The overview renders as a pane above/beside the results: a "thinking…" stream
  of the loop's reasoning (candidate queries, the pivot, the confirmation), then
  a settled answer + the corrected/best result(s), with citations
  (server-built, as today).
- Streaming reasoning is what makes the embed + loop latency *welcome*: the user
  watches convergence instead of waiting on a spinner. Keep the reasoning honest
  and legible (what it searched, what contradicted, what it corrected) — that
  transparency is the feature, not decoration.
- Deliberate-recollection search is precisely the context where a few seconds of
  visible reasoning is a *good* trade; do not bring this weight to navigational
  search (that's what the gate prevents).

## Cost / abuse controls (now load-bearing)

Every gated NL query can fire an LLM turn + embed + a retrieval loop, so
[`docs/search-answer-abuse-mitigation.md`](./search-answer-abuse-mitigation.md)
stops being "future work" and becomes a **launch prerequisite**:

- **Token-bucket rate limit** per IP and per user (cheap; do first).
- **Global daily LLM spend cap** — hard ceiling on OpenRouter cost regardless of
  caller.
- **Adaptive proof-of-work** on the answer endpoint for anonymous / high-rate
  callers (hashcash-style, escalating difficulty).
- **The gate itself is a cost control:** keyword/navigational searches never
  reach the agent, so the expensive path stays a minority of traffic.
- `maxSteps` cap (already 8) bounds per-request fan-out.

## Rollout

1. **Windows into `lc_media_v1`** — extend the mapping with the nested `windows`
   field; index windows at ingest (reuse the Go windowing logic, ported to the
   Node/Temporal indexer); add the window exact-cosine signal to
   `runMediaHybridSearch`'s rerank and to snippet `inner_hits`. Verify no new ANN
   graph is loaded (still `script_score` only). Needs a reindex.
2. **Remove the Go/Qdrant path** ([list above](#what-gets-removed)) — behind the
   same PR or immediately after, once windows-in-OS is validated.
3. **The gate + progressive/warm embed** — split first paint (BM25 + facets) from
   the reranked fold-in; speculative embed-on-type.
4. **The agentic overview** — evolve `/api/search-answer` into the gated detective
   loop with the recollection heuristics and multi-strategy tools; stream the
   reasoning.
5. **Abuse controls** — implement the mitigation doc *before* the overview is
   reachable unauthenticated.

## Open questions

- **Gate precision.** What exactly flips a query into "recollection"? Needs
  tuning against real query logs; over-triggering burns money, under-triggering
  hides the feature. Start conservative + manual override.
- **Default window recall.** Does the memory-safe deterministic pool (§2a) plus
  the agent cover enough, or do we need the quantized window ANN field (§2b)?
  Answer with the eval harness, not intuition.
- **How much reasoning to stream.** Full loop transparency vs a curated subset —
  balance "watching it work" against leaking noisy dead-ends.
- **Correction confidence.** When does the agent *assert* a correction ("it was
  Mormons") vs *offer* it ("did you mean…")? Wrong-but-confident is worse than
  tentative.

## Eval

Do not tune the gate or window recall by eyeballing. Extend the existing eval
harness ([rerank doc](./search-paragraph-rerank.md#tuning-knobs),
[scaling guide Step 0](./search-scaling-guide.md)) with:

- **Noisy-recollection queries** — deliberately wrong labels + near-verbatim
  quotes (the granddaughter case as the canonical fixture) — to measure whether
  the loop converges + corrects.
- **Gate confusion matrix** — navigational vs recollection queries, to measure
  false-dig (cost) and missed-dig (hidden feature) rates.
- **Window-vs-paragraph snippet** nDCG, to confirm contiguous spans help and to
  decide the §2a-vs-§2b recall question.

## Appendix: what the harness told us

Full aomin corpus, three modes (OpenSearch hybrid; Qdrant paragraph snippets;
Qdrant window snippets). Headlines:

- **Query embed ~226 ms dominates both backends** — the biggest single cost, and
  the reason search feels slow. (Motivates the two-lane relocation.)
- **Top-5 ranking overlap between OS and Qdrant: median 1 of 5.** They diverge
  because Qdrant is dense-only (no lexical fusion wired) — it surfaces
  topically-relevant but opaquely-titled episodes; OS's BM25+kNN wins
  keyword/navigational intent. (Motivates keeping OS's tuned hybrid.)
- **Facets: OS native, Qdrant empty** for speaker/verse. (Decisive for a
  facet-heavy product.)
- **Memory: Qdrant ~5× smaller RSS**, but OS's number is a fixed 2 GiB heap 16%
  used, and OS deliberately avoids the paragraph HNSW graph. (Real but narrower
  than it looks; the escape hatch is noted.)
- **`windowsOnly` changes snippets — and sometimes the #1 doc** (3/8 queries):
  scattered best-cosine paragraphs vs a contiguous window span. (Motivates
  windows-in-OS for coherent passages.)

## See also

- [`search-paragraph-rerank.md`](./search-paragraph-rerank.md) — the exact-cosine
  rerank that keeps OpenSearch off the OOM path; windows extend it.
- [`search-answer-abuse-mitigation.md`](./search-answer-abuse-mitigation.md) —
  the cost/abuse controls this design makes mandatory.
- [`search-ranking-tuning.md`](./search-ranking-tuning.md) /
  [`search-preferences.md`](./search-preferences.md) — current ranking mechanics
  + intent (the relevance floor the gate reuses).
- [`search-scaling-guide.md`](./search-scaling-guide.md) — the 55k+ re-tune, the
  eval-harness prerequisite, and where the Qdrant escape hatch would re-open.
- `todo.ignore.md` — the original "find the thing I half-remember" agentic notes.
