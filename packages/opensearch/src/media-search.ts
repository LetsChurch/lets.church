import { z } from 'zod';
import { type OsMsearchItem, type OsQuery, osSearch } from './client';

// Hybrid search over the unified `lc_media_v1` index. Fuses three signals with
// OpenSearch's `hybrid` query + the score-normalization search pipeline:
//
//   1. BM25 lexical — title/description/summary/channelName + nested
//      `paragraphs.text` (the latter surfaces matched paragraphs via inner_hits
//      `para_bm25`, with <mark> highlighting, mirroring lc_transcripts).
//   2. Document-level kNN over `searchSummaryEmbedding` (whole-video semantic
//      match — "is this video about the thing you asked for").
//   3. Paragraph-level kNN over the nested `paragraphs.embedding` knn_vector
//      (which moment in the video matches — surfaced via inner_hits `para_knn`,
//      with `expand_nested_docs` so multiple paragraphs per video come back).
//
// The three sub-query score lists are fused in the `RRF_PIPELINE` search pipeline
// (created in mappings.ts) — min_max normalization + a weighted mean that favors
// the lexical signal, so a hit that only the paragraph-kNN found still ranks,
// while a decisive lexical/phrase match isn't flattened away (it replaced plain
// RRF, which fused by rank and discarded magnitude). See
// docs/search-ranking-tuning.md.
//
// The query vector is a single request-time embedding of the user query with
// the same model the index was built with (text-embedding-3-small, 1536 dims).
// Speaker scoping is first-class: `paragraphSpeakers` restricts to paragraphs
// whose attributed `paragraphs.speakerName` matches (the `speaker` keyword still
// holds raw diarization labels like SPEAKER_00). Visual "objects" from the query
// parser are folded into `lexicalText`; there are still no image embeddings.

export const MEDIA_INDEX = 'lc_media_v1';

// Flat companion index for speaker suggestions: one doc per (upload, label)
// attribution, holding that label's mean 192-dim titanet vector + speakerId +
// channelId. kNN + collapse(speakerId) over this gives server-side, score-ranked
// identity suggestions (see suggestSpeakersByEmbedding).
export const SPEAKER_VECTOR_INDEX = 'lc_speaker_vectors';

// Search pipeline (PUT in mappings.ts) that normalizes + weight-fuses the hybrid
// sub-queries. Id kept as `lc-media-rrf` though it no longer uses RRF.
export const RRF_PIPELINE = 'lc-media-rrf';

// inner_hits names must be unique across all hybrid sub-queries in one request.
const PARA_BM25 = 'para_bm25';
const PARA_KNN = 'para_knn';

// kNN candidate pool per sub-query.
const KNN_K = 50;

// Query-time analyzer for the lexical (BM25) clauses that define the matched set.
// `paragraphs.text`/`title`/etc. are indexed with the standard analyzer (keeps
// stopwords, no stemming), so a query like "The Dorean Principle" makes the
// nested paragraph `match` scan "the"'s enormous posting list across ~7.86M
// nested docs — ~3s, and it pulls a broad, low-relevance set into the facet
// counts. The `stop` analyzer drops English stopwords from the QUERY only
// (lowercase, no stemming → its tokens stay a subset of the standard-indexed
// tokens, so matches are unaffected), cutting that to ~30ms with identical top
// results and a far more relevant facet set. Applied only to the set-defining
// clauses (multi_match + nested match), not the phrase boosts.
const LEXICAL_QUERY_ANALYZER = 'stop';

// TEMPORARY mitigation for the off-heap faiss OOM. faiss loads a knn_vector
// field's HNSW graph into native (off-heap) memory the moment that field is
// queried with kNN. The nested `paragraphs.embedding` graph is ~100GB resident
// across the corpus and OOM-kills the OpenSearch pod (exit 137) on essentially
// every hybrid search — even at a 24Gi container limit. While disabled, hybrid
// search keeps the cheap doc-level summary kNN (one vector per upload) and BM25
// paragraph snippets; it loses only the *semantic* paragraph-moment matching
// (the `para_knn` inner_hits). The sub-query SLOT is preserved as `match_none`
// so the 3-weight RRF normalization pipeline ([0.5, 0.25, 0.25]) stays valid
// without a cluster-side pipeline migration.
//
// Default OFF (the mitigation is active). Re-enable with MEDIA_PARAGRAPH_KNN=true
// once lc_media_v1 is reindexed with on_disk / byte (SQ) quantization, which cuts
// the native footprint ~1/32 and lets the graph fit in memory.
const PARAGRAPH_KNN_ENABLED = process.env.MEDIA_PARAGRAPH_KNN === 'true';

// Speaker-suggestion confidence floor (0–100, in the cosine-derived match-%
// the UI shows). faiss `cosinesimil` knn returns score = (1 + cosine)/2, so
// cosine = 2*score - 1 and match% = round(cosine*100). Identities whose best
// matching voice is below this are NOT suggested — only high-confidence voice
// matches surface. (The dashboard's one-click quick-assign uses a stricter 80%.)
const SPEAKER_SUGGEST_MIN_MATCH_PERCENT = 70;

// Verse facet `terms` size. The facet UI lists the most-cited verses as filter
// chips; nobody scrolls thousands. Cap at a display-sized top-N (doc_count
// order, most-cited first) instead of the full ~31k-verse canon — a giant `size`
// bloats the per-shard priority queue and the response payload for no benefit.
const VERSE_FACET_SIZE = 100;
// Speaker facet `terms` size — same display-chip rationale; bounded well under
// the real speaker cardinality.
const SPEAKER_FACET_SIZE = 200;

// Which facet aggregations a facet body should compute. Each caller asks for
// exactly the facets it will read (the leave-one-out scoping in runMediaFacets).
export type MediaFacetKey = 'channels' | 'speakers' | 'verses' | 'years';

function facetAggs(facets: MediaFacetKey[]): Record<string, unknown> {
  const aggs: Record<string, unknown> = {};
  for (const facet of facets) {
    switch (facet) {
      case 'channels':
        // Default execution (global ordinals) — far faster than `execution_hint:
        // 'map'` over the broad lexical matched set, and the ordinals fielddata
        // is cheap heap that the cluster has to spare (the OOM was off-heap
        // faiss, not heap).
        aggs.channelIds = { terms: { field: 'channelId', size: 100 } };
        break;
      case 'speakers':
        aggs.speakers = {
          terms: { field: 'speakers', size: SPEAKER_FACET_SIZE },
        };
        break;
      case 'verses':
        aggs.bibleRefs = {
          terms: { field: 'bibleRefs', size: VERSE_FACET_SIZE },
        };
        break;
      case 'years':
        aggs.publishedYears = {
          date_histogram: {
            field: 'publishedAt',
            calendar_interval: 'year',
            min_doc_count: 1,
            format: 'yyyy',
            order: { _key: 'desc' },
          },
        };
        break;
    }
  }
  return aggs;
}

// Access-control + readiness filter. Mirrors the related-media kNN in web's
// media.ts: only public, approved, fully-processed uploads. Every sub-query
// carries this so no signal can leak private/unapproved content.
function accessControlFilter(): OsQuery[] {
  return [
    { term: { visibility: 'PUBLIC' } },
    { term: { channelVisibility: 'PUBLIC' } },
    { exists: { field: 'channelApprovedAt' } },
    { exists: { field: 'transcodingFinishedAt' } },
    { exists: { field: 'transcribingFinishedAt' } },
  ];
}

export type PublishedAtRange = { gte?: string; lte?: string };

function buildFilter(
  channelIds?: string[] | null,
  publishedAt?: PublishedAtRange | null,
  bibleRefs?: string[] | null,
  bibleBooks?: string[] | null,
  speakers?: string[] | null,
  uploadIds?: string[] | null,
): OsQuery[] {
  const filter = accessControlFilter();
  // Restrict to specific media docs. The media doc `_id` IS the upload's internal
  // UUID, so this scopes retrieval to one (or a few) videos — used by the
  // per-video "ask about this video" feature.
  if (Array.isArray(uploadIds) && uploadIds.length > 0) {
    filter.push({ ids: { values: uploadIds } });
  }
  if (Array.isArray(channelIds) && channelIds.length > 0) {
    filter.push({ terms: { channelId: channelIds } });
  }
  if (publishedAt && (publishedAt.gte || publishedAt.lte)) {
    filter.push({ range: { publishedAt } });
  }
  // OSIS verse tokens ("John.3.16"). `terms` is OR semantics — a doc matches if
  // it cites any selected verse.
  if (Array.isArray(bibleRefs) && bibleRefs.length > 0) {
    filter.push({ terms: { bibleRefs } });
  }
  // OSIS book ids ("Rom"). OR semantics, AND'd with the verse filter when both
  // are present (cites a selected book and a selected verse).
  if (Array.isArray(bibleBooks) && bibleBooks.length > 0) {
    filter.push({ terms: { bibleBooks } });
  }
  // Resolved speaker names (doc-level rollup). OR within, AND'd across facets.
  if (Array.isArray(speakers) && speakers.length > 0) {
    filter.push({ terms: { speakers } });
  }
  return filter;
}

export type BuildMediaSearchArgs = {
  /** Free-text lexical query (keywords + objects + speakers, joined). Must be non-empty. */
  lexicalText: string;
  /** Exact phrases to match verbatim (from quoted text in the query). */
  quotes?: string[];
  /** Channel UUIDs to restrict to (already resolved from slugs/names). */
  channelIds?: string[] | null;
  /** Published-at range derived from parsed dates. */
  publishedAt?: PublishedAtRange | null;
  /** OSIS verse tokens ("John.3.16") to restrict to (the Bible-verse facet). */
  bibleRefs?: string[] | null;
  /** OSIS book ids ("Rom") to restrict to (the Bible-book facet). */
  bibleBooks?: string[] | null;
  /** Resolved speaker names to restrict to (the doc-level speaker facet). */
  speakers?: string[] | null;
  /** Internal upload UUIDs (= media doc `_id`) to restrict to — scopes retrieval
   * to specific videos (per-video "ask about this video"). */
  uploadIds?: string[] | null;
  /**
   * Paragraph-level speaker scope (distinct from the doc-level `speakers`
   * facet). When set, results are restricted to videos that contain a paragraph
   * attributed to one of these speakers, AND the matched paragraphs (the
   * inner_hits / context) are limited to that speaker's — i.e. "what did X say".
   * Matched against the analyzed `paragraphs.speakerName`, so a partial name
   * ("Conley") matches the stored full name ("Conley Owens").
   */
  paragraphSpeakers?: string[] | null;
  /** 1536-dim query embedding (text-embedding-3-small). */
  queryVector: number[];
  from?: number;
  size?: number;
  /**
   * Optional field sort (e.g. `[{ publishedAt: 'desc' }]`). When set, hits are
   * ordered by the field instead of the fused RRF relevance score (`_score`
   * comes back null). Omit for relevance order. The RRF search pipeline
   * tolerates a field sort — it still normalizes, then OpenSearch reorders.
   */
  sort?: unknown;
  /** Max paragraph snippets returned by the BM25 sub-query per hit (the lexical
   * matches — i.e. the highlighted "matching paragraphs" the UI lists). */
  innerHitsSize?: number;
  /** Max paragraph snippets returned by the paragraph-kNN sub-query per hit.
   * Defaults to `innerHitsSize`. Kept smaller for the results UI (its job is the
   * best semantic *moment*, not an exhaustive list) so "show more" isn't padded
   * with unhighlighted semantic neighbors. */
  knnInnerHitsSize?: number;
  /**
   * Wrap BM25 snippet matches in `<mark>` highlight tags. The results UI needs
   * this; the agent does not (its context text comes from the DB, not the
   * snippets), so it passes `false` to skip the work and avoid mark-stripping.
   */
  highlight?: boolean;
  /**
   * Which facet aggregations to compute on this body. Aggregations are the
   * heaviest heap consumer on this path, so the default is **none** — the result
   * query reads zero facets (it has `runMediaFacets` for that), and each facet
   * body requests only the one facet it's read for. See `facetAggs`.
   */
  facets?: MediaFacetKey[];
  /**
   * Attach paragraph `inner_hits` (the snippet sources) to the BM25/kNN nested
   * clauses. Default true. The hybrid query computes inner_hits for the whole
   * `pagination_depth` fusion window (≈100), not just the returned page — for a
   * common-term query each candidate has hundreds of matching paragraphs, so this
   * is ~3s. `runMediaHybridSearch` therefore passes `false` and fetches snippets
   * for just the returned page via `buildMediaSnippetBody` (~10x cheaper).
   */
  withInnerHits?: boolean;
};

// nested inner_hits config shared by the BM25 and kNN paragraph sub-queries.
// `excludes` drops the 1536-float embedding from every snippet.
function paragraphInnerHits(
  name: string,
  size: number,
  highlight: boolean,
): OsQuery {
  return {
    name,
    size,
    _source: { excludes: ['paragraphs.embedding', 'embedding'] },
    ...(highlight
      ? {
          highlight: {
            pre_tags: ['<mark>'],
            post_tags: ['</mark>'],
            encoder: 'html',
            fields: { 'paragraphs.text': {} },
          },
        }
      : {}),
  };
}

// Access-control filter + paragraph-level speaker scope, shared by the hybrid
// result query and the (cheap) facet query so both match the same doc set.
function resolveFilter(
  args: Pick<
    BuildMediaSearchArgs,
    | 'channelIds'
    | 'publishedAt'
    | 'bibleRefs'
    | 'bibleBooks'
    | 'speakers'
    | 'uploadIds'
    | 'paragraphSpeakers'
  >,
): {
  filter: OsQuery[];
  speakerNested: OsQuery | null;
  scopeToSpeaker: (q: OsQuery) => OsQuery;
} {
  const filter = buildFilter(
    args.channelIds,
    args.publishedAt,
    args.bibleRefs,
    args.bibleBooks,
    args.speakers,
    args.uploadIds,
  );

  // Paragraph-level speaker scope: a bool over the analyzed speakerName so a
  // paragraph matches when its attributed speaker is one of the requested names.
  // Used both as a nested constraint on the paragraph sub-queries (so the
  // matched/context paragraphs are the speaker's) and — wrapped in a doc-level
  // nested filter below — to drop videos the speaker never appears in.
  const speakerNested: OsQuery | null =
    args.paragraphSpeakers && args.paragraphSpeakers.length > 0
      ? {
          bool: {
            should: args.paragraphSpeakers.map((n) => ({
              match: {
                'paragraphs.speakerName': { query: n, operator: 'and' },
              },
            })),
            minimum_should_match: 1,
          },
        }
      : null;
  if (speakerNested) {
    filter.push({ nested: { path: 'paragraphs', query: speakerNested } });
  }

  // Wrap a nested paragraph query so its matches are limited to the requested
  // speaker (no-op when no speaker scope is set).
  const scopeToSpeaker = (paragraphQuery: OsQuery): OsQuery =>
    speakerNested
      ? { bool: { must: [paragraphQuery], filter: [speakerNested] } }
      : paragraphQuery;

  return { filter, speakerNested, scopeToSpeaker };
}

/**
 * Build the OpenSearch hybrid-query request body for lc_media_v1. Run with
 * `search_pipeline: RRF_PIPELINE` (see `runMediaHybridSearch`).
 */
export function buildMediaHybridBody({
  lexicalText,
  quotes = [],
  channelIds,
  publishedAt,
  bibleRefs,
  bibleBooks,
  speakers,
  uploadIds,
  paragraphSpeakers,
  queryVector,
  from = 0,
  size = 20,
  sort,
  innerHitsSize = 3,
  knnInnerHitsSize = innerHitsSize,
  highlight = true,
  facets = [],
  withInnerHits = true,
}: BuildMediaSearchArgs): OsMsearchItem {
  const trimmed = lexicalText.trim();
  const { filter, speakerNested, scopeToSpeaker } = resolveFilter({
    channelIds,
    publishedAt,
    bibleRefs,
    bibleBooks,
    speakers,
    uploadIds,
    paragraphSpeakers,
  });

  // (1) BM25 lexical
  const lexicalShould: OsQuery[] = [
    {
      multi_match: {
        query: trimmed,
        fields: ['title^2', 'description', 'summary', 'channelName'],
        analyzer: LEXICAL_QUERY_ANALYZER,
      },
    },
    {
      nested: {
        path: 'paragraphs',
        // Require a paragraph to match a fraction of the query terms before it
        // counts as a match — `match` is OR over tokens, so otherwise any
        // paragraph containing a single common word qualifies and floods the
        // snippet list with irrelevant matches. The combined `2<70%` rule
        // requires ALL terms for 1–2 word queries (a bare percent would floor to
        // 1 and let single-token matches back in) and scales to 70% for longer
        // queries (5 words → 3, 10 → 7). The `stop` analyzer removes stopwords
        // from the query first, so they no longer count toward the total (or
        // scan their huge posting lists — see LEXICAL_QUERY_ANALYZER).
        query: scopeToSpeaker({
          match: {
            'paragraphs.text': {
              query: trimmed,
              minimum_should_match: '2<70%',
              analyzer: LEXICAL_QUERY_ANALYZER,
            },
          },
        }),
        // Score the doc by its single best-matching paragraph, not the average:
        // a video with one paragraph that nails the query shouldn't be diluted
        // by its many other, weakly-matching paragraphs.
        score_mode: 'max',
        ...(withInnerHits
          ? {
              inner_hits: paragraphInnerHits(
                PARA_BM25,
                innerHitsSize,
                highlight,
              ),
            }
          : {}),
      },
    },
  ];

  // Phrase-proximity boost: reward a CONSECUTIVE (or near-consecutive) match of
  // the phrase in the title or a paragraph, so an exact phrase outscores docs
  // that merely scatter the same words. This is only a BM25 boost — RRF then
  // fuses it with the two semantic signals, so a strong phrase match rises but
  // isn't force-ranked to the top. Applied to each explicit quoted phrase
  // (exact, strongest boost — the user opted in); and, when the query is
  // unquoted and multi-word, to the whole query as an implicit phrase with a
  // little slop to tolerate minor gaps / filler words.
  const addPhraseBoost = (
    phrase: string,
    titleBoost: number,
    paraBoost: number,
    slop: number,
  ) => {
    const p = phrase.trim();
    if (!p) return;
    lexicalShould.push({
      match_phrase: { title: { query: p, boost: titleBoost, slop } },
    });
    lexicalShould.push({
      nested: {
        path: 'paragraphs',
        query: scopeToSpeaker({
          match_phrase: {
            'paragraphs.text': { query: p, boost: paraBoost, slop },
          },
        }),
        score_mode: 'max',
      },
    });
  };
  if (quotes.length > 0) {
    for (const quote of quotes) addPhraseBoost(quote, 3, 2, 0);
  } else if (trimmed.split(/\s+/).filter(Boolean).length >= 2) {
    addPhraseBoost(trimmed, 2, 1.5, 2);
  }

  const bm25Query: OsQuery = {
    bool: { filter, should: lexicalShould, minimum_should_match: 1 },
  };

  // (2) document-level kNN over searchSummaryEmbedding. Access/date filter is
  // applied as a parent-level bool filter alongside the knn clause.
  const summaryKnnQuery: OsQuery = {
    bool: {
      filter,
      must: [
        { knn: { searchSummaryEmbedding: { vector: queryVector, k: KNN_K } } },
      ],
    },
  };

  // (3) paragraph-level nested kNN. The access/date filter lives in the parent
  // bool (the knn filter context inside `nested` only sees nested-doc fields).
  // `expand_nested_docs` returns multiple matching paragraphs per video.
  //
  // Gated by PARAGRAPH_KNN_ENABLED: when off (the default, see above), this slot
  // is `match_none` so the faiss `paragraphs.embedding` graph is never loaded —
  // the slot stays present (the RRF pipeline expects three sub-queries) but
  // contributes no score and no `para_knn` inner_hits.
  const paragraphKnnQuery: OsQuery = PARAGRAPH_KNN_ENABLED
    ? {
        bool: {
          filter,
          must: [
            {
              nested: {
                path: 'paragraphs',
                query: {
                  knn: {
                    'paragraphs.embedding': {
                      vector: queryVector,
                      k: KNN_K,
                      expand_nested_docs: true,
                      // Pre-filter the kNN to the requested speaker's paragraphs
                      // so semantic matches are also speaker-scoped (no-op
                      // otherwise).
                      ...(speakerNested ? { filter: speakerNested } : {}),
                    },
                  },
                },
                score_mode: 'max',
                ...(withInnerHits
                  ? {
                      inner_hits: paragraphInnerHits(
                        PARA_KNN,
                        knnInnerHitsSize,
                        false,
                      ),
                    }
                  : {}),
              },
            },
          ],
        },
      }
    : { match_none: {} };

  return {
    from,
    size,
    // Hydrate uploads from the DB by _id; the index is only the relevance
    // source of truth. We keep inner_hits (snippets) but skip the doc _source.
    _source: false,
    query: {
      hybrid: {
        // Hybrid pagination needs a window at least as deep as the page.
        pagination_depth: Math.max(100, from + size),
        queries: [bm25Query, summaryKnnQuery, paragraphKnnQuery],
      },
    },
    // Only the requested facets (doc_count order). Empty → no `aggs` key at all,
    // so the result query and later pages do zero aggregation work.
    ...(facets.length > 0 ? { aggs: facetAggs(facets) } : {}),
    ...(sort ? { sort } : {}),
  };
}

/**
 * Build a snippet-only body that re-derives the paragraph `inner_hits` for a
 * specific set of result `uploadIds` (the displayed page). Scoped to those ids,
 * the nested paragraph matches touch only ~10 docs, so this is cheap — unlike
 * computing inner_hits inline on the hybrid (which spans the whole
 * `pagination_depth` fusion window). Mirrors the BM25 (and, when enabled,
 * paragraph-kNN) nested clauses of `buildMediaHybridBody` so the snippets are
 * identical to what the inline inner_hits would have produced.
 */
export function buildMediaSnippetBody(
  args: BuildMediaSearchArgs,
  uploadIds: string[],
): OsMsearchItem {
  const trimmed = args.lexicalText.trim();
  const innerHitsSize = args.innerHitsSize ?? 3;
  const knnInnerHitsSize = args.knnInnerHitsSize ?? innerHitsSize;
  const highlight = args.highlight ?? true;
  const { speakerNested, scopeToSpeaker } = resolveFilter(args);

  const should: OsQuery[] = [
    {
      nested: {
        path: 'paragraphs',
        query: scopeToSpeaker({
          match: {
            'paragraphs.text': {
              query: trimmed,
              minimum_should_match: '2<70%',
              analyzer: LEXICAL_QUERY_ANALYZER,
            },
          },
        }),
        score_mode: 'max',
        inner_hits: paragraphInnerHits(PARA_BM25, innerHitsSize, highlight),
      },
    },
  ];
  if (PARAGRAPH_KNN_ENABLED) {
    should.push({
      nested: {
        path: 'paragraphs',
        query: {
          knn: {
            'paragraphs.embedding': {
              vector: args.queryVector,
              k: KNN_K,
              expand_nested_docs: true,
              ...(speakerNested ? { filter: speakerNested } : {}),
            },
          },
        },
        score_mode: 'max',
        inner_hits: paragraphInnerHits(PARA_KNN, knnInnerHitsSize, false),
      },
    });
  }

  return {
    size: uploadIds.length,
    _source: false,
    query: { bool: { filter: [{ ids: { values: uploadIds } }], should } },
  };
}

/**
 * Execute the hybrid search and return the (already paginated) hits + total.
 * RRF fusion happens in the search pipeline. Snippets (`inner_hits`) are NOT
 * computed inline — that costs ~10x because the hybrid spans the whole
 * `pagination_depth` window — but fetched in a cheap second query scoped to the
 * returned page and attached, so callers (and `mergeParagraphSnippets`) see the
 * same shape.
 */
export async function runMediaHybridSearch(
  args: BuildMediaSearchArgs,
): Promise<{
  hits: MediaHit[];
  total: number;
}> {
  // The result query computes no aggregations (facets come from
  // `runMediaFacets`) and no inner_hits (fetched separately below).
  const raw = await osSearch({
    index: MEDIA_INDEX,
    search_pipeline: RRF_PIPELINE,
    ...buildMediaHybridBody({ ...args, facets: [], withInnerHits: false }),
  });
  const parsed = MediaSearchResponseSchema.parse(raw);
  const hits = parsed.hits.hits;

  if (hits.length > 0) {
    const snippetRaw = await osSearch({
      index: MEDIA_INDEX,
      ...buildMediaSnippetBody(
        args,
        hits.map((h) => h._id),
      ),
    });
    const byId = new Map(
      MediaSearchResponseSchema.parse(snippetRaw).hits.hits.map((h) => [
        h._id,
        h.inner_hits,
      ]),
    );
    for (const hit of hits) {
      hit.inner_hits = byId.get(hit._id);
    }
  }

  return { hits, total: parsed.hits.total.value };
}

/**
 * Build a CHEAP aggregation-only body for facet counts. Critically, this does
 * NOT use the `hybrid` query or the RRF pipeline: aggregating on top of a
 * `hybrid` query is pathologically slow (~12s vs ~15ms here — ~800x) because the
 * hybrid collector defeats the aggregation fast paths. Facet counts are
 * score-independent, so we aggregate over just the lexical matched set: the same
 * BM25 doc set the hybrid's lexical sub-query matches, minus the kNN-only
 * neighbours (an acceptable approximation for counts). No kNN, no nested
 * inner_hits, no phrase boosts (they change scoring, not the matched set), no
 * pipeline — run as a plain `_search`.
 */
export function buildMediaFacetBody(args: BuildMediaSearchArgs): OsMsearchItem {
  const trimmed = args.lexicalText.trim();
  const { filter, scopeToSpeaker } = resolveFilter(args);
  const should: OsQuery[] = [
    {
      multi_match: {
        query: trimmed,
        fields: ['title^2', 'description', 'summary', 'channelName'],
        analyzer: LEXICAL_QUERY_ANALYZER,
      },
    },
    {
      nested: {
        path: 'paragraphs',
        query: scopeToSpeaker({
          match: {
            'paragraphs.text': {
              query: trimmed,
              minimum_should_match: '2<70%',
              analyzer: LEXICAL_QUERY_ANALYZER,
            },
          },
        }),
        score_mode: 'max',
      },
    },
  ];
  return {
    size: 1,
    _source: false,
    query: { bool: { filter, should, minimum_should_match: 1 } },
    aggs: facetAggs(args.facets ?? []),
  };
}

/**
 * All facet lists for the search UI, computed with **leave-one-out** semantics:
 * each facet's options are aggregated with its OWN selection dropped but every
 * OTHER selection applied. So the channel facet ignores the channel filter (you
 * can still switch or broaden channels), while speakers, verses, and years are
 * scoped to the selected channel — and vice versa. Consequently every option a
 * facet offers is guaranteed to yield ≥1 result when added to the current
 * selections (no dead ends), and a facet never hides its own current pick.
 * Unlike the prior "fully independent" design, selecting a value in one facet
 * DOES reshape the others — standard faceted-search behavior. The result set is
 * still the AND of all selections (the main hybrid query, not here).
 *
 * A facet whose own selection is inactive reuses the fully-filtered body (dropping
 * an absent filter changes nothing), so a search with 0–1 active filters issues
 * only 1–2 aggregation queries, growing to one per active filter (+1) at most;
 * they run in parallel. Each is a cheap lexical aggregation body
 * (`buildMediaFacetBody`) — NOT the hybrid query — so it returns in ~tens of ms.
 */
export async function runMediaFacets(args: BuildMediaSearchArgs): Promise<{
  channels: Array<{ key: string; doc_count: number }>;
  speakers: Array<{ key: string; doc_count: number }>;
  verses: Array<{ key: string; doc_count: number }>;
  years: Array<{ year: string; doc_count: number }>;
}> {
  const base = { ...args, from: 0, size: 1, highlight: false };

  const hasChannel = Boolean(args.channelIds && args.channelIds.length > 0);
  const hasSpeaker = Boolean(args.speakers && args.speakers.length > 0);
  // Verse + book are one "scripture" dimension: the verse facet drops both.
  const hasScripture = Boolean(
    (args.bibleRefs && args.bibleRefs.length > 0) ||
      (args.bibleBooks && args.bibleBooks.length > 0),
  );
  const hasDate = Boolean(
    args.publishedAt && (args.publishedAt.gte || args.publishedAt.lte),
  );

  // Body 0 applies every active filter; each facet with an active selection of
  // its own adds a body that drops just that one. Facets without an active
  // selection read from body 0 (dropping nothing changes nothing) — so identical
  // bodies are never issued twice. Each body computes ONLY the facet(s) it's read
  // for: body 0 the un-selected facets, each leave-one-out body just its own. No
  // body ever pays for an aggregation nobody reads.
  const fullFacets: MediaFacetKey[] = [
    ...(hasChannel ? [] : (['channels'] as const)),
    ...(hasSpeaker ? [] : (['speakers'] as const)),
    ...(hasScripture ? [] : (['verses'] as const)),
    ...(hasDate ? [] : (['years'] as const)),
  ];
  const bodies: OsMsearchItem[] = [
    buildMediaFacetBody({ ...base, facets: fullFacets }),
  ];
  const fullIndex = 0;
  const pushBody = (
    overrides: Partial<BuildMediaSearchArgs>,
    facets: MediaFacetKey[],
  ): number => {
    bodies.push(buildMediaFacetBody({ ...base, ...overrides, facets }));
    return bodies.length - 1;
  };
  const channelIndex = hasChannel
    ? pushBody({ channelIds: null }, ['channels'])
    : fullIndex;
  const speakerIndex = hasSpeaker
    ? pushBody({ speakers: null }, ['speakers'])
    : fullIndex;
  const scriptureIndex = hasScripture
    ? pushBody({ bibleRefs: null, bibleBooks: null }, ['verses'])
    : fullIndex;
  const yearIndex = hasDate
    ? pushBody({ publishedAt: null }, ['years'])
    : fullIndex;

  // Plain `_search` per body, in parallel (no RRF pipeline — these are simple
  // lexical aggregation queries, not hybrid). The count is 1 + (active filters),
  // usually 1–2, and each returns in ~tens of ms.
  const responses = await Promise.all(
    bodies.map((body) => osSearch({ index: MEDIA_INDEX, ...body })),
  );
  const aggs = responses.map(
    (raw) => MediaSearchResponseSchema.parse(raw).aggregations,
  );

  return {
    channels: aggs[channelIndex]?.channelIds?.buckets ?? [],
    speakers: aggs[speakerIndex]?.speakers?.buckets ?? [],
    verses: aggs[scriptureIndex]?.bibleRefs?.buckets ?? [],
    years: (aggs[yearIndex]?.publishedYears?.buckets ?? []).map((b) => ({
      year: b.key_as_string,
      doc_count: b.doc_count,
    })),
  };
}

const KnnProbeResponseSchema = z.object({
  hits: z.object({
    hits: z.array(z.object({ _score: z.number().nullable() })),
  }),
});

/**
 * Relevance probe: the top document-level kNN score (over `searchSummaryEmbedding`)
 * for a query vector. A pure kNN query (no BM25, no RRF pipeline) so the returned
 * `_score` is an absolute, monotonic-in-cosine signal — unlike the RRF-fused
 * `_score` from `runMediaHybridSearch`, which is only meaningful as a relative
 * ordering. Used to gate the AI answer: when no video in the library is
 * semantically close to the query, skip generating an (inevitably ungrounded)
 * answer. For the faiss `cosinesimil` space OpenSearch returns
 * `score = (1 + cosine) / 2`, so the caller can recover cosine as `2*score - 1`.
 * Returns null when there are no candidate documents at all.
 */
export async function runMediaKnnProbe({
  queryVector,
  channelIds,
  publishedAt,
  bibleRefs,
  bibleBooks,
  speakers,
  uploadIds,
}: {
  queryVector: number[];
  channelIds?: string[] | null;
  publishedAt?: PublishedAtRange | null;
  bibleRefs?: string[] | null;
  bibleBooks?: string[] | null;
  speakers?: string[] | null;
  uploadIds?: string[] | null;
}): Promise<number | null> {
  const filter = buildFilter(
    channelIds,
    publishedAt,
    bibleRefs,
    bibleBooks,
    speakers,
    uploadIds,
  );
  const raw = await osSearch({
    index: MEDIA_INDEX,
    size: 1,
    _source: false,
    query: {
      bool: {
        filter,
        must: [
          {
            knn: { searchSummaryEmbedding: { vector: queryVector, k: KNN_K } },
          },
        ],
      },
    },
  });
  return KnnProbeResponseSchema.parse(raw).hits.hits[0]?._score ?? null;
}

/**
 * Whether the query has a *specific* lexical match in the (access-filtered)
 * library: it overlaps a title, or appears verbatim as a phrase in a transcript.
 * Used as a second-chance override on the semantic relevance gate — a rare,
 * distinctive word ("colabor") that IS a chapter title can sit below the kNN
 * cosine floor (it's semantically isolated) and get wrongly suppressed. A title
 * or exact-phrase hit means the query genuinely exists in the library, so the
 * results shouldn't be gated off. Deliberately strict (title overlap OR exact
 * phrase, not a loose OR-token match) so common-word/off-topic queries — which
 * the floor SHOULD suppress — don't slip through. BM25-only, size 0; cheap.
 */
export async function hasStrongLexicalMatch({
  lexicalText,
  channelIds,
  publishedAt,
  bibleRefs,
  bibleBooks,
  speakers,
  uploadIds,
}: {
  lexicalText: string;
  channelIds?: string[] | null;
  publishedAt?: PublishedAtRange | null;
  bibleRefs?: string[] | null;
  bibleBooks?: string[] | null;
  speakers?: string[] | null;
  uploadIds?: string[] | null;
}): Promise<boolean> {
  const q = lexicalText.trim();
  if (!q) return false;
  const filter = buildFilter(
    channelIds,
    publishedAt,
    bibleRefs,
    bibleBooks,
    speakers,
    uploadIds,
  );
  const raw = await osSearch({
    index: MEDIA_INDEX,
    size: 0,
    track_total_hits: 1,
    _source: false,
    query: {
      bool: {
        filter,
        should: [
          // The query overlaps a title (a navigational / title-word match).
          { match: { title: { query: q, minimum_should_match: '2<70%' } } },
          // The whole query appears verbatim in a transcript paragraph.
          {
            nested: {
              path: 'paragraphs',
              query: { match_phrase: { 'paragraphs.text': q } },
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
  });
  return MediaSearchResponseSchema.parse(raw).hits.total.value > 0;
}

// Collapsed hit shape for the speaker-suggestion kNN over `lc_speaker_vectors`.
const SpeakerVectorResponseSchema = z.object({
  hits: z.object({
    hits: z.array(
      z.object({
        _score: z.number().nullable(),
        _source: z.object({ speakerId: z.string() }),
      }),
    ),
  }),
});

export type SpeakerCandidate = {
  speakerId: string;
  /** Best (highest) kNN score for this identity. cosine = 2*topScore - 1. */
  topScore: number;
};

/**
 * Suggest candidate speaker identities for an unlabeled diarization label by
 * voice similarity. Runs approximate kNN over `lc_speaker_vectors` — a flat
 * index holding ONE representative (mean) vector per `(upload, label)`
 * attribution — and `collapse`s by `speakerId`, so OpenSearch returns one
 * top-scoring hit per distinct speaker, ranked by cosine. Grouping is done
 * server-side via collapse (no nested-agg `_score` ambiguity, no per-hit
 * bucketing in Node); the caller only converts score → match %.
 *
 * Why a flat index instead of kNN over the nested `lc_media_v1` paragraphs:
 * faiss filtered-kNN on a nested field returns nothing here, approximate nested
 * kNN saturates on an upload's near-identical per-paragraph vectors, and neither
 * aggregations (knn scoring barred in agg context) nor nested-agg `_score`
 * (which is the parent's, not the paragraph's) can score-rank per speaker.
 *
 * `channelIds` scopes the pool to authorized content (the requesting channel +
 * any channels whose speakers it may attribute via an approved link). No PUBLIC
 * access-control filter is applied, so the caller MUST pass a trusted,
 * authorization-derived channel set.
 */
export async function suggestSpeakersByEmbedding({
  speakerEmbedding,
  channelIds,
  size = 20,
  k = 200,
  minMatchPercent = SPEAKER_SUGGEST_MIN_MATCH_PERCENT,
}: {
  speakerEmbedding: number[];
  channelIds?: string[] | null;
  /** Max distinct speakers to return (collapse groups). */
  size?: number;
  /** kNN candidate pool size before collapse. */
  k?: number;
  /** Drop identities whose best voice match is below this confidence (0–100). */
  minMatchPercent?: number;
}): Promise<SpeakerCandidate[]> {
  const filter: OsQuery[] = [];
  if (Array.isArray(channelIds) && channelIds.length > 0) {
    filter.push({ terms: { channelId: channelIds } });
  }

  const raw = await osSearch({
    index: SPEAKER_VECTOR_INDEX,
    size,
    _source: ['speakerId'],
    query: {
      bool: {
        ...(filter.length > 0 ? { filter } : {}),
        must: [{ knn: { embedding: { vector: speakerEmbedding, k } } }],
      },
    },
    // One hit per speaker — the top-scoring (upload, label) vector for each.
    collapse: { field: 'speakerId' },
  });

  const parsed = SpeakerVectorResponseSchema.parse(raw);
  // cosinesimil knn returns score = (1 + cosine)/2; floor in the same domain.
  const minScore = (minMatchPercent / 100 + 1) / 2;
  return parsed.hits.hits
    .map((h) => ({ speakerId: h._source.speakerId, topScore: h._score ?? 0 }))
    .filter((c) => c.topScore >= minScore);
}

// --- Search-bar typeahead: one query powering the whole command palette ---

const TermsAggSchema = z
  .object({
    buckets: z.array(z.object({ key: z.string(), doc_count: z.number() })),
  })
  .optional();

const PaletteSuggestResponseSchema = z.object({
  hits: z.object({
    hits: z.array(
      z.object({
        _source: z.object({ title: z.string().nullable().optional() }),
      }),
    ),
  }),
  aggregations: z
    .object({
      channelIds: TermsAggSchema,
      speakers: TermsAggSchema,
      bibleBooks: TermsAggSchema,
      bibleRefs: TermsAggSchema,
      publishedYears: z
        .object({
          buckets: z.array(
            z.object({ key_as_string: z.string(), doc_count: z.number() }),
          ),
        })
        .optional(),
    })
    .optional(),
});

export type FacetBucket = { key: string; count: number };
export type MediaPaletteSuggestions = {
  /** Left-column title suggestions — titles containing every typed token. */
  titles: string[];
  /** Bucket key is the channelId (caller hydrates to slug/name/avatar). */
  channels: FacetBucket[];
  /** Bucket key is the resolved speaker name. */
  speakers: FacetBucket[];
  /** Bucket key is the OSIS book id ("Rom"). */
  books: FacetBucket[];
  /** Bucket key is the OSIS verse token ("John.3.16"). */
  verses: FacetBucket[];
  /** Year string ("yyyy") + count. */
  years: Array<{ year: string; count: number }>;
};

/**
 * One OpenSearch query that powers the entire search-bar command palette: its
 * hits become the left-column TITLE suggestions and its aggregations become the
 * right-column FACETS (channels / speakers / books / verses / years). A single
 * `bool_prefix` `multi_match` over the doc-level text fields
 * (`title^2 / description / summary / channelName`) with `accessControlFilter()` —
 * no RRF pipeline, no nested-paragraph sub-queries, no leave-one-out (the palette
 * has no active selections yet). Cheap enough per keystroke; a lexical proxy, so
 * facet counts can differ slightly from the full hybrid panel on the results page.
 *
 * Titles ride the same broad query (so this is one request, not two): the broad
 * `bool_prefix` (with `title^2`) drives both scoring and the aggregations, while a
 * `post_filter` restricts the returned *hits* to docs whose title actually matches
 * every typed token (last token as a prefix). `post_filter` runs after aggregation,
 * so the facet buckets still reflect the full broad match while the title column
 * never surfaces a body-only hit — all of which OpenSearch does, no JS gate.
 */
export async function suggestMediaPalette({
  query,
  titleSize = 6,
  perGroup = 8,
}: {
  query: string;
  titleSize?: number;
  perGroup?: number;
}): Promise<MediaPaletteSuggestions> {
  const empty: MediaPaletteSuggestions = {
    titles: [],
    channels: [],
    speakers: [],
    books: [],
    verses: [],
    years: [],
  };
  const trimmed = query.trim();
  if (!trimmed) return empty;

  const raw = await osSearch({
    index: MEDIA_INDEX,
    // Over-fetch so dedupe still leaves `titleSize` distinct titles when several
    // title-matching docs share a title.
    size: Math.max(titleSize * 5, 30),
    _source: ['title'],
    query: {
      bool: {
        filter: accessControlFilter(),
        must: [
          {
            multi_match: {
              query: trimmed,
              type: 'bool_prefix',
              fields: ['title^2', 'description', 'summary', 'channelName'],
            },
          },
        ],
      },
    },
    // Applied after aggregations: facets still reflect the broad match above, but
    // the returned hits (the title column) are limited to title matches — every
    // typed token must hit the title, last token as a prefix.
    post_filter: {
      match_bool_prefix: {
        title: { query: trimmed, operator: 'and' },
      },
    },
    aggs: {
      channelIds: { terms: { field: 'channelId', size: perGroup } },
      speakers: { terms: { field: 'speakers', size: perGroup } },
      bibleBooks: { terms: { field: 'bibleBooks', size: perGroup } },
      bibleRefs: { terms: { field: 'bibleRefs', size: perGroup } },
      publishedYears: {
        date_histogram: {
          field: 'publishedAt',
          calendar_interval: 'year',
          min_doc_count: 1,
          format: 'yyyy',
          order: { _key: 'desc' },
        },
      },
    },
  });

  const parsed = PaletteSuggestResponseSchema.parse(raw);

  // Hits are already title-matched by the post_filter; here we only collapse
  // duplicate titles (distinct docs can share one) and cap to `titleSize`.
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const h of parsed.hits.hits) {
    const title = (h._source.title ?? '').trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
    if (titles.length >= titleSize) break;
  }

  const aggs = parsed.aggregations;
  const toBuckets = (agg: z.infer<typeof TermsAggSchema>): FacetBucket[] =>
    (agg?.buckets ?? []).map((b) => ({ key: b.key, count: b.doc_count }));

  return {
    titles,
    channels: toBuckets(aggs?.channelIds),
    speakers: toBuckets(aggs?.speakers),
    books: toBuckets(aggs?.bibleBooks),
    verses: toBuckets(aggs?.bibleRefs),
    years: (aggs?.publishedYears?.buckets ?? [])
      .map((b) => ({ year: b.key_as_string, count: b.doc_count }))
      .slice(0, perGroup),
  };
}

export type BuildMediaLexicalArgs = {
  lexicalText: string;
  quotes?: string[];
  channelIds?: string[] | null;
  publishedAt?: PublishedAtRange | null;
  from?: number;
  size?: number;
  sort?: unknown;
  /** Doc `_source` fields to return (false by default). */
  source?: string[] | false;
};

/**
 * BM25-only request over lc_media_v1 (no vectors, no RRF pipeline). Powers
 * aggregate/temporal questions ("how many times", "first/last time") — pass to
 * `osSearch`. `track_total_hits` gives an exact count; a publishedAt sort with
 * size 1 yields the earliest/latest match. Same access + date filters.
 */
export function buildMediaLexicalRequest({
  lexicalText,
  quotes = [],
  channelIds,
  publishedAt,
  from = 0,
  size = 1,
  sort,
  source = false,
}: BuildMediaLexicalArgs): OsMsearchItem & { index: string } {
  const trimmed = lexicalText.trim();
  const filter = buildFilter(channelIds, publishedAt);

  const should: OsQuery[] = [
    {
      multi_match: {
        query: trimmed,
        fields: ['title^2', 'description', 'summary', 'channelName'],
      },
    },
    {
      nested: {
        path: 'paragraphs',
        query: { match: { 'paragraphs.text': trimmed } },
        score_mode: 'avg',
      },
    },
  ];
  for (const quote of quotes) {
    const q = quote.trim();
    if (!q) continue;
    should.push({ match_phrase: { title: { query: q, boost: 3 } } });
    should.push({
      nested: {
        path: 'paragraphs',
        query: { match_phrase: { 'paragraphs.text': { query: q, boost: 2 } } },
        score_mode: 'max',
      },
    });
  }

  return {
    index: MEDIA_INDEX,
    from,
    size,
    track_total_hits: true,
    _source: source,
    query: { bool: { filter, should, minimum_should_match: 1 } },
    ...(sort ? { sort } : {}),
  };
}

// --- Response parsing ---

const ParagraphInnerHitSchema = z.object({
  _source: z
    .object({
      order: z.number().optional(),
      start: z.number(),
      end: z.number(),
      text: z.string(),
      speaker: z.string().nullable().optional(),
    })
    .nullable(),
  highlight: z
    .object({ 'paragraphs.text': z.array(z.string()) })
    .partial()
    .optional(),
});

const InnerHitsGroupSchema = z
  .object({
    hits: z.object({
      hits: z.array(ParagraphInnerHitSchema),
    }),
  })
  .optional();

export const MediaHitSchema = z.object({
  _id: z.string(),
  _score: z.number().nullable(),
  inner_hits: z
    .object({
      [PARA_BM25]: InnerHitsGroupSchema,
      [PARA_KNN]: InnerHitsGroupSchema,
    })
    .partial()
    .optional(),
});

export const MediaSearchResponseSchema = z.object({
  hits: z.object({
    total: z.object({ value: z.number(), relation: z.string() }),
    hits: z.array(MediaHitSchema),
  }),
  aggregations: z
    .object({
      channelIds: z
        .object({
          buckets: z.array(
            z.object({ key: z.string(), doc_count: z.number() }),
          ),
        })
        .optional(),
      speakers: z
        .object({
          buckets: z.array(
            z.object({ key: z.string(), doc_count: z.number() }),
          ),
        })
        .optional(),
      bibleRefs: z
        .object({
          buckets: z.array(
            z.object({ key: z.string(), doc_count: z.number() }),
          ),
        })
        .optional(),
      publishedYears: z
        .object({
          buckets: z.array(
            z.object({
              key_as_string: z.string(),
              doc_count: z.number(),
            }),
          ),
        })
        .optional(),
    })
    .optional(),
});

export type MediaHit = z.infer<typeof MediaHitSchema>;

export type MediaSegment = {
  /** Paragraph start, in milliseconds (the index stores seconds; we ×1000 to
   * match the existing search UI, which divides by 1000 everywhere). */
  start: number;
  end: number;
  /** Highlighted (with <mark>) when the match came from BM25; raw otherwise. */
  text: string;
  speaker?: string | null;
  /** Paragraph index within the upload — lets callers fetch neighbors for
   * surrounding context. Null on legacy docs without paragraph ordering. */
  order?: number | null;
};

/**
 * Merge the BM25 and kNN paragraph inner_hits for one media hit into a single
 * de-duplicated snippet list. Prefers the highlighted BM25 text when the same
 * paragraph surfaced from both signals. Times are converted from seconds (index)
 * to milliseconds (UI contract).
 *
 * Ordering: the single strongest match leads (the top BM25 inner hit, else the
 * top kNN — OpenSearch returns inner hits in score order, so `hits[0]` is best),
 * then the remaining matched paragraphs in chronological order so they read like
 * a timeline. The UI shows the lead and tucks the rest behind "show more".
 */
export function mergeParagraphSnippets(
  hit: MediaHit,
  limit = 25,
): MediaSegment[] {
  const byKey = new Map<string, MediaSegment>();

  const ingest = (
    group: z.infer<typeof InnerHitsGroupSchema>,
    highlighted: boolean,
  ) => {
    for (const inner of group?.hits.hits ?? []) {
      const src = inner._source;
      if (!src) continue;
      const key = `${src.start}:${src.end}`;
      const existing = byKey.get(key);
      const highlightedText = inner.highlight?.['paragraphs.text']?.[0];
      const text = highlighted && highlightedText ? highlightedText : src.text;
      // Keep a highlighted variant over a non-highlighted duplicate.
      if (existing && !(highlighted && highlightedText)) continue;
      byKey.set(key, {
        start: Math.round(src.start * 1000),
        end: Math.round(src.end * 1000),
        text,
        speaker: src.speaker ?? null,
        order: src.order ?? null,
      });
    }
  };

  // BM25 first so its highlighted text wins ties.
  ingest(hit.inner_hits?.[PARA_BM25], true);
  ingest(hit.inner_hits?.[PARA_KNN], false);

  // The strongest match leads; the rest follow in chronological order. The key
  // is `${start}:${end}` in raw index seconds (see `ingest`), matching the
  // top inner hit's source times.
  const topMatch =
    hit.inner_hits?.[PARA_BM25]?.hits.hits[0]?._source ??
    hit.inner_hits?.[PARA_KNN]?.hits.hits[0]?._source;
  const lead = topMatch ? byKey.get(`${topMatch.start}:${topMatch.end}`) : null;

  const rest = Array.from(byKey.values())
    .filter((seg) => seg !== lead)
    .sort((a, b) => a.start - b.start);

  return (lead ? [lead, ...rest] : rest).slice(0, limit);
}

/**
 * Start time (SECONDS) of the single strongest-matching paragraph for a hit —
 * the top BM25 inner hit, else the top kNN inner hit. OpenSearch returns inner
 * hits in score order, so `hits[0]` is the best match. Used as the citation
 * anchor so a citation jumps to where the matched content actually is, rather
 * than to the start of the surrounding context window (which can precede the
 * match). Null when the hit carries no paragraph inner hits (legacy docs).
 */
export function topMatchStartSeconds(hit: MediaHit): number | null {
  const top =
    hit.inner_hits?.[PARA_BM25]?.hits.hits[0]?._source ??
    hit.inner_hits?.[PARA_KNN]?.hits.hits[0]?._source;
  return top ? Math.round(top.start) : null;
}
