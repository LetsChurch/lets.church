# Search relevance preferences

The product principles that should guide how media search ranks and behaves.
These are the _intent_; the mechanics that currently implement them live in
[`search-ranking-tuning.md`](./search-ranking-tuning.md). When the two disagree,
this document is the goal and the tuning doc is just the current attempt at it.

**North star:** results should match what a _typical user_ would expect.
Validate against a spread of query shapes — quoted phrases, unquoted phrases,
exact titles, title words, plain keywords, natural-language questions, single
rare words, and deliberately off-topic queries — not just one happy path.

## Principles

1. **Exact and phrase matches should win.** If a document literally contains
   what the user typed — especially a distinctive multi-word phrase — it should
   rank at or near the top, even over content that's only semantically on-topic.
   A strong lexical match must not be buried by a merely-related one.

2. **Magnitude matters, not just rank.** A match that's decisively stronger
   should outrank a marginal one. Rank-only fusion (RRF) flattens a 4× lexical
   win into "one rank ahead" and loses it — so we fuse on _normalized scores_,
   weighted toward the lexical signal, instead.

3. **Quotes mean "this phrase matters" — but keep recall.** A quoted phrase gets
   the strongest exact-match boost and should float matching docs up. It should
   _not_ hard-filter everything else away: transcripts are ASR output with
   typos, so a strict "must contain this exact phrase" filter would silently
   drop valid results.

4. **Unquoted exact phrases still count.** Even without quotes, if the whole
   query appears verbatim in a document, that document should rise — as a boost
   within the fused ranking, not a forced #1.

5. **Ranking belongs in OpenSearch, not the app.** All relevance logic lives in
   the query and the search pipeline. No Node-side re-ranking or post-hoc
   reordering of results.

6. **Distinctive lexical matches are never suppressed.** A rare, specific word
   that genuinely matches (e.g. a word that _is_ a chapter title) must return
   results even when it's semantically isolated — the relevance gate must not
   hide it. Conversely, genuinely off-topic queries should still return nothing.

7. **Title / navigational queries return the title.** Searching an item's title,
   or distinctive words from it, should surface that item at #1.

8. **Matches must be meaningful — no single-stopword noise.** A paragraph should
   not count as a match (nor show as a snippet) just because it contains a common
   word like "of". Require a fraction of the query's terms, scaling with query
   length. Prefer standard, idiomatic techniques for this (e.g. a combined
   `minimum_should_match` rule) over bespoke hardcoding.

9. **Within a result: most-relevant paragraph leads; "show more" reveals the
   rest.** The single strongest-matching paragraph is the lead snippet; the
   remaining matched paragraphs are available behind "show more", in time order.

10. **Snippet highlighting reads cleanly.** Adjacent `<mark>` spans for a
    multi-word match are joined into one highlight rather than rendered as
    separate, overlapping boxes.

## Constraints

- **Stay on free / non-enterprise tiers.** Relevance features must work without a
  paid license — this is part of why we're on OpenSearch (RRF and score
  normalization are free there; on Elasticsearch, RRF is Platinum-gated while the
  equivalent `linear` retriever is free Basic).

- **Validate before declaring done.** Don't assert a ranking change works from
  reasoning alone — run real queries (the live endpoint and/or direct OpenSearch
  BM25 probes) and confirm against expectation. Several "obvious" fixes in this
  area turned out to be addressing the wrong cause.
