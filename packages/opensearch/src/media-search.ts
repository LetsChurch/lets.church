import { z } from 'zod';
import { type OsMsearchItem, type OsQuery, osSearch } from './client';

// Hybrid search over the unified `lc_media_v1` index. Fuses three signals with
// OpenSearch's `hybrid` query + the RRF score-ranker search pipeline:
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
// The three sub-query result lists are merged by Reciprocal Rank Fusion in the
// `RRF_PIPELINE` search pipeline (created in mappings.ts), so a hit that only
// the paragraph-kNN found (e.g. "love tank" → a paragraph about a "love cup")
// still ranks even though BM25 missed it entirely.
//
// The query vector is a single request-time embedding of the user query with
// the same model the index was built with (text-embedding-3-small, 1536 dims).
// Speakers and visual "objects" extracted by the query parser are folded into
// `lexicalText` only — there is no speaker-identity library yet (the `speaker`
// keyword holds diarization labels like SPEAKER_00) and no image embeddings.

export const MEDIA_INDEX = 'lc_media_v1';

// Search pipeline (PUT in mappings.ts) that RRF-fuses the hybrid sub-queries.
export const RRF_PIPELINE = 'lc-media-rrf';

// inner_hits names must be unique across all hybrid sub-queries in one request.
const PARA_BM25 = 'para_bm25';
const PARA_KNN = 'para_knn';

// kNN candidate pool per sub-query.
const KNN_K = 50;

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
): OsQuery[] {
  const filter = accessControlFilter();
  if (Array.isArray(channelIds) && channelIds.length > 0) {
    filter.push({ terms: { channelId: channelIds } });
  }
  if (publishedAt && (publishedAt.gte || publishedAt.lte)) {
    filter.push({ range: { publishedAt } });
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
  /** Max paragraph snippets returned per sub-query per hit. */
  innerHitsSize?: number;
  /**
   * Wrap BM25 snippet matches in `<mark>` highlight tags. The results UI needs
   * this; the agent does not (its context text comes from the DB, not the
   * snippets), so it passes `false` to skip the work and avoid mark-stripping.
   */
  highlight?: boolean;
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

/**
 * Build the OpenSearch hybrid-query request body for lc_media_v1. Run with
 * `search_pipeline: RRF_PIPELINE` (see `runMediaHybridSearch`).
 */
export function buildMediaHybridBody({
  lexicalText,
  quotes = [],
  channelIds,
  publishedAt,
  queryVector,
  from = 0,
  size = 20,
  sort,
  innerHitsSize = 3,
  highlight = true,
}: BuildMediaSearchArgs): OsMsearchItem {
  const trimmed = lexicalText.trim();
  const filter = buildFilter(channelIds, publishedAt);

  // (1) BM25 lexical
  const lexicalShould: OsQuery[] = [
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
        inner_hits: paragraphInnerHits(PARA_BM25, innerHitsSize, highlight),
      },
    },
  ];
  for (const quote of quotes) {
    const q = quote.trim();
    if (!q) continue;
    lexicalShould.push({ match_phrase: { title: { query: q, boost: 3 } } });
    lexicalShould.push({
      nested: {
        path: 'paragraphs',
        query: { match_phrase: { 'paragraphs.text': { query: q, boost: 2 } } },
        score_mode: 'max',
      },
    });
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
  const paragraphKnnQuery: OsQuery = {
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
                },
              },
            },
            score_mode: 'max',
            inner_hits: paragraphInnerHits(PARA_KNN, innerHitsSize, false),
          },
        },
      ],
    },
  };

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
    aggs: {
      channelIds: { terms: { field: 'channelId', size: 100 } },
    },
    ...(sort ? { sort } : {}),
  };
}

/**
 * Execute the hybrid search and return the (already paginated) hits, the total,
 * and channel facet buckets. RRF fusion happens in the search pipeline.
 */
export async function runMediaHybridSearch(
  args: BuildMediaSearchArgs,
): Promise<{
  hits: MediaHit[];
  total: number;
  facetChannelIds: Array<{ key: string; doc_count: number }>;
}> {
  const raw = await osSearch({
    index: MEDIA_INDEX,
    search_pipeline: RRF_PIPELINE,
    ...buildMediaHybridBody(args),
  });
  const parsed = MediaSearchResponseSchema.parse(raw);
  return {
    hits: parsed.hits.hits,
    total: parsed.hits.total.value,
    facetChannelIds: parsed.aggregations?.channelIds?.buckets ?? [],
  };
}

/**
 * Channel facet list for the search UI. Runs the same hybrid query as
 * `runMediaHybridSearch` but **without** the channel filter. Omitting the
 * channel filter is what keeps faceting additive: picking one channel must not
 * drop the other channels from the list, so the user can broaden their
 * selection. Access + date filters still apply, so the list stays scoped to
 * channels that actually have matches for this query within the chosen date
 * range.
 *
 * We only want the `channelId` terms aggregation, not hits — but the RRF
 * score-normalization processor throws on `size: 0` ("number of documents after
 * fetch phase [0] is different from number of documents from query phase [N]"),
 * since it needs a non-empty fetch window to normalize. Aggregations are
 * computed in the query phase over *all* matching docs regardless of the window,
 * so `size: 1` gives the complete facet counts while keeping the processor
 * happy; the single fetched hit is discarded.
 */
export async function runMediaChannelFacets(
  args: BuildMediaSearchArgs,
): Promise<Array<{ key: string; doc_count: number }>> {
  const body = buildMediaHybridBody({
    ...args,
    channelIds: null,
    from: 0,
    size: 1,
    highlight: false,
  });
  const raw = await osSearch({
    index: MEDIA_INDEX,
    search_pipeline: RRF_PIPELINE,
    ...body,
  });
  const parsed = MediaSearchResponseSchema.parse(raw);
  return parsed.aggregations?.channelIds?.buckets ?? [];
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
}: {
  queryVector: number[];
  channelIds?: string[] | null;
  publishedAt?: PublishedAtRange | null;
}): Promise<number | null> {
  const filter = buildFilter(channelIds, publishedAt);
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
 * ordered, de-duplicated snippet list. Prefers the highlighted BM25 text when
 * the same paragraph surfaced from both signals. Times are converted from
 * seconds (index) to milliseconds (UI contract).
 */
export function mergeParagraphSnippets(
  hit: MediaHit,
  limit = 10,
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

  return Array.from(byKey.values())
    .sort((a, b) => a.start - b.start)
    .slice(0, limit);
}
