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

// Flat companion index for speaker suggestions: one doc per (upload, label)
// attribution, holding that label's mean 192-dim titanet vector + speakerId +
// channelId. kNN + collapse(speakerId) over this gives server-side, score-ranked
// identity suggestions (see suggestSpeakersByEmbedding).
export const SPEAKER_VECTOR_INDEX = 'lc_speaker_vectors';

// Search pipeline (PUT in mappings.ts) that RRF-fuses the hybrid sub-queries.
export const RRF_PIPELINE = 'lc-media-rrf';

// inner_hits names must be unique across all hybrid sub-queries in one request.
const PARA_BM25 = 'para_bm25';
const PARA_KNN = 'para_knn';

// kNN candidate pool per sub-query.
const KNN_K = 50;

// Speaker-suggestion confidence floor (0–100, in the cosine-derived match-%
// the UI shows). faiss `cosinesimil` knn returns score = (1 + cosine)/2, so
// cosine = 2*score - 1 and match% = round(cosine*100). Identities whose best
// matching voice is below this are NOT suggested — only high-confidence voice
// matches surface. (The dashboard's one-click quick-assign uses a stricter 80%.)
const SPEAKER_SUGGEST_MIN_MATCH_PERCENT = 70;

// Verse facet `terms` size. The Protestant canon has ~31,102 verses, so this
// ceiling returns every distinct cited verse — the facet never truncates. (The
// agg only materializes buckets for verses that actually appear, so a high cap
// is cheap on a single-shard index.)
const VERSE_FACET_SIZE = 31200;

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
): OsQuery[] {
  const filter = accessControlFilter();
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
  /** Resolved speaker names to restrict to (the speaker facet). */
  speakers?: string[] | null;
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
  bibleRefs,
  bibleBooks,
  speakers,
  queryVector,
  from = 0,
  size = 20,
  sort,
  innerHitsSize = 3,
  highlight = true,
}: BuildMediaSearchArgs): OsMsearchItem {
  const trimmed = lexicalText.trim();
  const filter = buildFilter(
    channelIds,
    publishedAt,
    bibleRefs,
    bibleBooks,
    speakers,
  );

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
      // Speaker facet: distinct resolved speaker names across the matching set.
      speakers: { terms: { field: 'speakers', size: 1000 } },
      // Verse facet: every distinct cited verse across the matching set
      // (doc_count order). Sized to the full canon so nothing is truncated.
      bibleRefs: { terms: { field: 'bibleRefs', size: VERSE_FACET_SIZE } },
      // Year facet: real per-year counts over publishedAt (newest first),
      // skipping empty years. `format: 'yyyy'` yields key_as_string = the year.
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
 * All facet lists for the search UI in one query. Each facet is **independent**:
 * the aggregations run with every user facet selection dropped (channel, date,
 * and scripture), so they reflect only the query + access control. Selecting a
 * value in one facet never reshapes another facet's options or counts — the
 * sidebar shows the full set for the query, while the result set itself is
 * narrowed by the AND of all selections (handled by the main search query, not
 * here). Returns channel + verse `terms` buckets (doc_count order) and per-year
 * `date_histogram` buckets (newest-first).
 *
 * We only want the aggregations, not hits — but the RRF score-normalization
 * processor throws on `size: 0` ("number of documents after fetch phase [0] is
 * different from number of documents from query phase [N]"), since it needs a
 * non-empty fetch window to normalize. Aggregations are computed in the query
 * phase over *all* matching docs regardless of the window, so `size: 1` gives
 * complete facet counts while keeping the processor happy; the hit is discarded.
 */
export async function runMediaFacets(args: BuildMediaSearchArgs): Promise<{
  channels: Array<{ key: string; doc_count: number }>;
  speakers: Array<{ key: string; doc_count: number }>;
  verses: Array<{ key: string; doc_count: number }>;
  years: Array<{ year: string; doc_count: number }>;
}> {
  const body = buildMediaHybridBody({
    ...args,
    // Independent facets: drop every facet selection so each list is complete.
    channelIds: null,
    publishedAt: null,
    bibleRefs: null,
    bibleBooks: null,
    speakers: null,
    from: 0,
    size: 1,
    highlight: false,
  });
  const raw = await osSearch({
    index: MEDIA_INDEX,
    search_pipeline: RRF_PIPELINE,
    ...body,
  });
  const aggs = MediaSearchResponseSchema.parse(raw).aggregations;
  return {
    channels: aggs?.channelIds?.buckets ?? [],
    speakers: aggs?.speakers?.buckets ?? [],
    verses: aggs?.bibleRefs?.buckets ?? [],
    years: (aggs?.publishedYears?.buckets ?? []).map((b) => ({
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
}: {
  queryVector: number[];
  channelIds?: string[] | null;
  publishedAt?: PublishedAtRange | null;
  bibleRefs?: string[] | null;
  bibleBooks?: string[] | null;
  speakers?: string[] | null;
}): Promise<number | null> {
  const filter = buildFilter(
    channelIds,
    publishedAt,
    bibleRefs,
    bibleBooks,
    speakers,
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
