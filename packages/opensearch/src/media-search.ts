import { z } from 'zod';

import {
  type OsMsearchItem,
  type OsQuery,
  osMsearch,
  osSearch,
} from './client';

// Hybrid search over the unified `lc_media_v1` index. Two stages:
//
// STAGE 1 — retrieve a candidate pool with OpenSearch's `hybrid` query + the
// score-normalization pipeline, fusing two signals:
//   1. BM25 lexical — title/description/summary/channelName + nested
//      `paragraphs.text` (the latter surfaces matched paragraphs via inner_hits
//      `para_bm25`, with <mark> highlighting, mirroring lc_transcripts).
//   2. Document-level kNN over `searchSummaryEmbedding` (whole-video semantic
//      match — "is this video about the thing you asked for").
//   (A third `match_none` slot is kept so the 3-weight pipeline stays valid.)
//
// STAGE 2 — rerank the pool by each doc's best-paragraph EXACT cosine, RRF-fused
// with the stage-1 order. This replaced approximate nested paragraph kNN, which
// forced faiss to load a ~100GB HNSW graph off-heap and OOM-killed the pod: exact
// cosine is a `script_score` that reads raw vectors and never loads the graph.
// See runMediaHybridSearch + docs/search-paragraph-rerank.md.
//
// Stage-1 sub-query scores are fused in the `RRF_PIPELINE` search pipeline
// (created in mappings.ts) — min_max normalization + a weighted mean favoring the
// lexical signal. See docs/search-ranking-tuning.md.
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
// inner_hits name for the window kNN recall (runWindowKnnRecall) — carries the
// winning window's inline `paras`. (Windows are a RANKING signal + the agent's
// recall target; they are no longer rendered as a contiguous-span snippet.)
const WINDOW_KNN = 'window_knn';

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

// Paragraph-level semantic signal via EXACT cosine, not ANN kNN. Approximate
// nested `paragraphs.embedding` kNN forced faiss to load a ~100GB HNSW graph
// into off-heap memory and OOM-killed the pod (exit 137) on every query. Instead
// we retrieve a candidate pool with the cheap stage-1 hybrid (BM25 + doc-summary
// kNN), then rerank the pool by each doc's best paragraph's exact cosine computed
// in a `script_score` — which reads raw vectors and NEVER loads the HNSW graph,
// so it cannot OOM. Bounded by the pool size, not the corpus.
//
// Params from offline eval (LLM-judged nDCG@5 over 16 queries × query types):
// baseline (stage-1 only) 0.67 → 0.735 fusing paragraph cosine at stage1:para =
// 1:2. Doc-summary exact-rescore and title embeddings were evaluated and did NOT
// help (≈ baseline / slightly worse), so neither is used — and titles need no
// reindex. See docs/search-paragraph-rerank.md.
// The results UI requests 20 hits at a time. Keep hybrid reranking and every
// cumulative stage-1 request within three UI pages (60 candidates); smaller
// callers may address the final candidate with an offset up to 59.
export const MEDIA_SEARCH_MAX_PAGE_SIZE = 20;
export const MEDIA_SEARCH_MAX_CANDIDATES = 60;
export const MEDIA_SEARCH_MAX_OFFSET = MEDIA_SEARCH_MAX_CANDIDATES - 1;

export const MediaSearchPaginationSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(MEDIA_SEARCH_MAX_PAGE_SIZE)
      .default(MEDIA_SEARCH_MAX_PAGE_SIZE),
    cursor: z
      .number()
      .int()
      .nonnegative()
      .max(MEDIA_SEARCH_MAX_OFFSET)
      .default(0),
  })
  .superRefine(({ cursor, limit }, ctx) => {
    if (cursor + limit > MEDIA_SEARCH_MAX_CANDIDATES) {
      ctx.addIssue({
        code: 'custom',
        path: ['cursor'],
        message: `Search candidate window must not exceed ${MEDIA_SEARCH_MAX_CANDIDATES}`,
      });
    }
  });

const RERANK_POOL = MEDIA_SEARCH_MAX_CANDIDATES;
// Skip paragraphs shorter than this — degenerate one-word turns ("Grace.") score
// perfect cosine but are useless as ranking evidence / snippets. `start`/`end`
// are seconds.
const RERANK_MIN_PARAGRAPH_SECONDS = 5;
const RERANK_RRF_K = 60;
const RERANK_W_STAGE1 = 1;
const RERANK_W_PARAGRAPH = 2;
// Painless: 0 for paragraphs with no vector or below the min duration, else
// cosine + 1 (faiss cosinesimil convention keeps the score positive). Used for
// both the rerank scoring and the semantic snippet selection.
const PARAGRAPH_COSINE_SCRIPT =
  "doc['paragraphs.embedding'].size()==0 || doc['paragraphs.start'].size()==0 || " +
  "doc['paragraphs.end'].size()==0 || (doc['paragraphs.end'].value - doc['paragraphs.start'].value) < params.mindur ? 0.0 : cosineSimilarity(params.qv, doc['paragraphs.embedding']) + 1.0";

// Story-run "window" rerank weight, fused alongside the paragraph-cosine signal
// (start conservative — same 2 as paragraphs; tune via the eval harness). A
// window is a rolling 4-paragraph span, so its best-cosine rewards docs whose
// coherent multi-paragraph passage — not just a lucky single sentence — is on
// point. See docs/agentic-search-overview.md.
const RERANK_W_WINDOW = 2;
// Painless: 0 for windows with no vector, else cosine + 1 (faiss cosinesimil
// convention keeps the score positive). Like PARAGRAPH_COSINE_SCRIPT this reads
// raw vectors from doc-values and NEVER loads the window HNSW graph, so it cannot
// OOM. Used for both the window rerank scoring and the contiguous-span snippet.
const WINDOW_COSINE_SCRIPT =
  "doc['windows.embedding'].size()==0 ? 0.0 : cosineSimilarity(params.qv, doc['windows.embedding']) + 1.0";

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

// Facets are computed over the top-*scored* docs, not the whole broad lexical
// match set. Over the full set, count-based facets are dominated by high-volume
// channels that merely contain a query word (e.g. any channel with lots of
// "…principle…" content), so the chips don't reflect the results.
//
// The cutoff is a `min_score` floor RELATIVE to the query's own top score
// (FACET_MIN_SCORE_FRACTION × max_score), which makes the effective sample size
// adapt to the query: a narrow query ("what is the dorean principle?") keeps only
// its ~dozens of strong matches (→ The Dorean Principle / Selling Jesus / AD
// Robles), while a broad one ("the doctrine of election") keeps hundreds. A fixed
// doc count can't do that — too small starves broad queries; too large backfills
// narrow ones with weak single-term matches and the big channels creep back.
// (0.35 was too loose — Sovereign Grace returned to #1; 0.5 tracks the results.)
//
// `min_score` is absolute, so runMediaFacets probes for max_score first, then
// floors the facet queries. FACET_SAMPLE_CAP is the sampler bound that keeps the
// aggregation cheap when a very broad query clears the floor with thousands.
const FACET_MIN_SCORE_FRACTION = 0.5;
const FACET_SAMPLE_CAP = 300;

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
//
// Exported so out-of-band media queries (e.g. web's internal
// media-for-verse endpoint, which lets.bible calls) reuse the exact same
// gate rather than re-declaring a parallel filter that can drift.
export function accessControlFilter(): OsQuery[] {
  return [
    { term: { visibility: 'PUBLIC' } },
    { term: { channelVisibility: 'PUBLIC' } },
    { exists: { field: 'channelApprovedAt' } },
    { exists: { field: 'transcodingFinishedAt' } },
    { exists: { field: 'transcribingFinishedAt' } },
  ];
}

// --- Exact-quote transcript grep (detective `grepTranscript` tool) -----------
// Fast, case-insensitive SUBSTRING match of a remembered verbatim quote against
// the transcript, over the `paragraphs.text.wildcard` multi-field. This is the
// OpenSearch-native replacement for the old Postgres `ILIKE` + pg_trgm path:
// same data, no second store, access control via the shared filter. The
// analyzed `paragraphs.text` field can't do arbitrary substring matching
// (stemming/tokenization); the `wildcard` sub-field can (mid-word, across
// tokens), and matches are EXACT (no trigram false positives).

const GREP_PARAS = 'grep_paras';

export type GrepMatch = {
  /** Media doc `_id` = the upload's internal UUID. */
  uploadId: string;
  /** Paragraph index within the upload (for fetching neighbors). */
  order: number | null;
  /** Paragraph start, in SECONDS (index-native; the caller rounds/×1000). */
  start: number;
  text: string;
  title: string | null;
  channelName: string | null;
};

const GrepParaInnerSchema = z.object({
  _source: z
    .object({
      order: z.number().nullable().optional(),
      start: z.number(),
      text: z.string(),
    })
    .nullable()
    .optional(),
});

const GrepResponseSchema = z.object({
  hits: z.object({
    hits: z.array(
      z.object({
        _id: z.string(),
        _source: z
          .object({
            title: z.string().nullable().optional(),
            channelName: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
        inner_hits: z
          .object({
            [GREP_PARAS]: z
              .object({
                hits: z.object({ hits: z.array(GrepParaInnerSchema) }),
              })
              .optional(),
          })
          .optional(),
      }),
    ),
  }),
});

// Escape the `wildcard` query's metacharacters (`\`, `*`, `?`) so a remembered
// quote containing them matches literally, then wrap in `*…*` for substring.
function escapeWildcard(s: string): string {
  return s.replace(/[\\*?]/g, (c) => `\\${c}`);
}

/**
 * Find a remembered near-verbatim QUOTE as an exact, case-insensitive substring
 * of the transcript. Access control mirrors the search path (PUBLIC + approved +
 * processed); an empty `channelIds` array means "a channel was named but matched
 * nothing" → no results (not a library-wide search). Returns one entry per
 * matched paragraph (capped), each with its video + timestamp.
 */
export async function grepParagraphs(args: {
  phrase: string;
  channelIds?: string[] | null;
  maxDocs?: number;
  perDoc?: number;
}): Promise<GrepMatch[]> {
  const phrase = args.phrase.trim();
  if (phrase.length < 3) {
    return [];
  }
  const filter = accessControlFilter();
  if (Array.isArray(args.channelIds)) {
    if (args.channelIds.length === 0) {
      return [];
    }
    filter.push({ terms: { channelId: args.channelIds } });
  }

  const raw = await osSearch({
    index: MEDIA_INDEX,
    size: args.maxDocs ?? 8,
    _source: ['title', 'channelName'],
    query: {
      bool: {
        filter,
        must: [
          {
            nested: {
              path: 'paragraphs',
              query: {
                wildcard: {
                  'paragraphs.text.wildcard': {
                    value: `*${escapeWildcard(phrase)}*`,
                    case_insensitive: true,
                  },
                },
              },
              inner_hits: {
                name: GREP_PARAS,
                size: args.perDoc ?? 3,
                _source: {
                  includes: [
                    'paragraphs.order',
                    'paragraphs.start',
                    'paragraphs.text',
                  ],
                },
              },
            },
          },
        ],
      },
    },
  });

  const parsed = GrepResponseSchema.parse(raw);
  const out: GrepMatch[] = [];
  for (const hit of parsed.hits.hits) {
    for (const inner of hit.inner_hits?.[GREP_PARAS]?.hits.hits ?? []) {
      const s = inner._source;
      if (!s) {
        continue;
      }
      out.push({
        uploadId: hit._id,
        order: s.order ?? null,
        start: s.start,
        text: s.text,
        title: hit._source?.title ?? null,
        channelName: hit._source?.channelName ?? null,
      });
    }
  }
  return out;
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
  if (Array.isArray(channelIds)) {
    filter.push(
      channelIds.length > 0
        ? { terms: { channelId: channelIds } }
        : { match_none: {} },
    );
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
  /** Channel UUIDs to restrict to; an empty array explicitly matches no media. */
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
  /**
   * 1536-dim query embedding (text-embedding-3-small). Omit (or pass empty) for
   * the **lexical** path — the instant results list — which runs pure BM25 with
   * no query embed, no doc-summary kNN, and no cosine rerank. Present only on the
   * AI/agent path, which keeps the full hybrid: semantics now live in the AI
   * overview, not the instant results (see `runMediaHybridSearch`).
   */
  queryVector?: number[] | null;
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
  highlight = true,
  facets = [],
  withInnerHits = true,
}: BuildMediaSearchArgs): OsMsearchItem {
  const trimmed = lexicalText.trim();
  const { filter, scopeToSpeaker } = resolveFilter({
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
        // Require a real term overlap (matches the nested paragraph clause's
        // rule): `multi_match` defaults to OR, so without this a single stray
        // common word ("term") matches a whole doc — off-topic/gibberish queries
        // then surface loose OR-token noise. On the hybrid path the kNN relevance
        // probe used to suppress that; the lexical instant-results path (no
        // probe) relies on this floor instead. `2<70%`: ≤2 terms → all required,
        // >2 → 70% (stopwords already dropped by the `stop` analyzer). Applied to
        // both the result query and the facet query so facets match the results.
        minimum_should_match: '2<70%',
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

  // LEXICAL path (instant results): no query vector → a single BM25 query, NOT
  // the `hybrid` wrapper. So no doc-summary kNN, no RRF pipeline, and no
  // cosine rerank downstream — the whole semantic apparatus is skipped. BM25's
  // `minimum_should_match` is the relevance gate (no match → no results), so the
  // separate kNN relevance probe isn't needed either.
  if (!(Array.isArray(queryVector) && queryVector.length > 0)) {
    return {
      from,
      size,
      _source: false,
      query: bm25Query,
      ...(facets.length > 0 ? { aggs: facetAggs(facets) } : {}),
      ...(sort ? { sort } : {}),
    };
  }

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

  // (3) Empty slot. This used to be an approximate nested paragraph kNN, but that
  // loaded the ~100GB faiss HNSW graph off-heap and OOM-killed the pod. Paragraph
  // semantics now come from exact-cosine reranking in `runMediaHybridSearch`
  // instead. The slot stays present as `match_none` so the RRF normalization
  // pipeline (which expects three sub-queries, weights [0.5, 0.25, 0.25]) stays
  // valid without a cluster-side pipeline migration.
  const paragraphKnnQuery: OsQuery = { match_none: {} };

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
    // Lexical snippet: the best keyword-matching paragraph, `<mark>`-highlighted.
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

  // Semantic snippet: the best paragraph by exact cosine (script_score, never
  // loads the HNSW graph — see PARAGRAPH_COSINE_SCRIPT). Surfaces the relevant
  // moment for docs the reranker pulled in on meaning with no keyword overlap.
  // Scoped to the page's uploadIds, so it only scores those docs' paragraphs.
  // Only on the hybrid (vector) path — the lexical results list has no semantic
  // moments to surface.
  if (Array.isArray(args.queryVector) && args.queryVector.length > 0) {
    should.push({
      nested: {
        path: 'paragraphs',
        query: {
          script_score: {
            query: speakerNested ?? { match_all: {} },
            script: {
              source: PARAGRAPH_COSINE_SCRIPT,
              params: {
                qv: args.queryVector,
                mindur: RERANK_MIN_PARAGRAPH_SECONDS,
              },
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
 * Body that scores each candidate upload by its best (≥ min-duration) paragraph's
 * exact cosine to the query — a `script_score`, so it reads raw vectors and never
 * loads the faiss HNSW graph (cannot OOM). Scoped to `uploadIds` (the retrieved
 * pool), so cost is bounded by the pool, not the corpus. `_score - 1` is the
 * cosine. Feeds the RRF rerank in `runMediaHybridSearch`.
 */
export function buildParagraphCosineBody(
  queryVector: number[],
  uploadIds: string[],
): OsMsearchItem {
  return {
    size: uploadIds.length,
    _source: false,
    query: {
      bool: {
        filter: [{ ids: { values: uploadIds } }],
        must: [
          {
            nested: {
              path: 'paragraphs',
              score_mode: 'max',
              query: {
                script_score: {
                  query: { match_all: {} },
                  script: {
                    source: PARAGRAPH_COSINE_SCRIPT,
                    params: {
                      qv: queryVector,
                      mindur: RERANK_MIN_PARAGRAPH_SECONDS,
                    },
                  },
                },
              },
            },
          },
        ],
      },
    },
  };
}

/**
 * Body that scores each candidate upload by its best window's exact cosine to the
 * query — a `script_score` over the nested `windows`, so (like the paragraph
 * variant) it reads raw vectors and never loads the faiss HNSW graph (cannot
 * OOM). Scoped to `uploadIds` (the retrieved pool). `_score - 1` is the cosine.
 * Feeds the window signal in `runMediaHybridSearch`'s rerank.
 */
export function buildWindowCosineBody(
  queryVector: number[],
  uploadIds: string[],
): OsMsearchItem {
  return {
    size: uploadIds.length,
    _source: false,
    query: {
      bool: {
        filter: [{ ids: { values: uploadIds } }],
        must: [
          {
            nested: {
              path: 'windows',
              score_mode: 'max',
              query: {
                script_score: {
                  query: { match_all: {} },
                  script: {
                    source: WINDOW_COSINE_SCRIPT,
                    params: { qv: queryVector },
                  },
                },
              },
            },
          },
        ],
      },
    },
  };
}

/**
 * RRF-fuse the stage-1 hybrid order (candidate index) with one or more
 * exact-cosine signals (paragraph, window), each weighted. Score for a candidate
 * is `RERANK_W_STAGE1/(K+stage1Rank) + Σ weight_i/(K+rank_i)`. Returns the
 * candidates reordered. Generalizes the former paragraph-only rerank so the
 * window signal fuses alongside it without a second pass.
 */
function rerankByCosineSignals(
  candidates: MediaHit[],
  signals: Array<{ cosineById: Map<string, number>; weight: number }>,
): MediaHit[] {
  const rankMaps = signals.map(({ cosineById }) => {
    const byCosine = [...candidates].sort(
      (a, b) => (cosineById.get(b._id) ?? 0) - (cosineById.get(a._id) ?? 0),
    );
    return new Map(byCosine.map((h, i) => [h._id, i]));
  });
  return candidates
    .map((hit, stage1Rank) => {
      let score = RERANK_W_STAGE1 / (RERANK_RRF_K + stage1Rank);
      for (const [i, { weight }] of signals.entries()) {
        const rank = rankMaps[i]?.get(hit._id) ?? candidates.length;
        score += weight / (RERANK_RRF_K + rank);
      }
      return { hit, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((s) => s.hit);
}

/**
 * Execute the hybrid search and return the paginated hits + total. Pipeline:
 *
 *   1. Retrieve a candidate POOL with the stage-1 hybrid (BM25 + doc-summary
 *      kNN, fused by the RRF pipeline). No aggregations, no inner_hits.
 *   2. Rerank the pool by each doc's best-paragraph exact cosine (memory-safe
 *      script_score — never loads the HNSW graph), RRF-fused with the stage-1
 *      order at 1:2. Skipped for a field sort (date) — there, order is the field.
 *   3. Snippets for the returned page only (lexical `<mark>` + semantic), fetched
 *      in a cheap scoped query and attached, so callers / mergeParagraphSnippets
 *      see the usual `inner_hits` shape.
 *
 * Reranking covers the bounded candidate pool; deeper pages are rejected before
 * any OpenSearch request so ranking does not change within the supported range.
 */
export type MediaHybridSearchDependencies = {
  search: typeof osSearch;
  msearch: typeof osMsearch;
};

const defaultMediaHybridSearchDependencies: MediaHybridSearchDependencies = {
  search: osSearch,
  msearch: osMsearch,
};

export async function runMediaHybridSearch(
  args: BuildMediaSearchArgs,
  dependencies: MediaHybridSearchDependencies = defaultMediaHybridSearchDependencies,
): Promise<{
  hits: MediaHit[];
  total: number;
}> {
  const from = args.from ?? 0;
  const size = args.size ?? MEDIA_SEARCH_MAX_PAGE_SIZE;
  if (!Number.isInteger(from) || from < 0 || from > MEDIA_SEARCH_MAX_OFFSET) {
    throw new RangeError(
      `Media search offset must be an integer between 0 and ${MEDIA_SEARCH_MAX_OFFSET}`,
    );
  }
  if (
    !Number.isInteger(size) ||
    size < 1 ||
    size > MEDIA_SEARCH_MAX_PAGE_SIZE
  ) {
    throw new RangeError(
      `Media search page size must be an integer between 1 and ${MEDIA_SEARCH_MAX_PAGE_SIZE}`,
    );
  }
  if (from + size > MEDIA_SEARCH_MAX_CANDIDATES) {
    throw new RangeError(
      `Media search candidate window must not exceed ${MEDIA_SEARCH_MAX_CANDIDATES}`,
    );
  }
  // Lexical path when no query vector: plain BM25, no RRF pipeline, no rerank.
  const qv =
    Array.isArray(args.queryVector) && args.queryVector.length > 0
      ? args.queryVector
      : null;
  // Rerank only on the hybrid (vector) path, in relevance order, within the pool.
  const rerankable = qv !== null && !args.sort;
  const fetchSize = rerankable ? RERANK_POOL : from + size;

  // Stage 1: retrieve the candidate pool (no aggregations / inner_hits). The RRF
  // normalization pipeline only applies to the multi-clause `hybrid` query, so
  // it's skipped on the single-clause lexical path.
  const raw = await dependencies.search({
    index: MEDIA_INDEX,
    ...(qv ? { search_pipeline: RRF_PIPELINE } : {}),
    ...buildMediaHybridBody({
      ...args,
      from: 0,
      size: fetchSize,
      facets: [],
      withInnerHits: false,
    }),
  });
  const parsed = MediaSearchResponseSchema.parse(raw);
  const total = parsed.hits.total.value;
  const candidates = parsed.hits.hits;

  // Stage 2: exact-cosine rerank over the pool (paragraph + window signals),
  // then take the page. Both signals are `script_score` (no HNSW graph load), and
  // we fetch them in ONE msearch round-trip rather than two parallel searches.
  // Skipped entirely on the lexical path (BM25 order is final).
  let pageHits: MediaHit[];
  if (rerankable && qv && candidates.length > 0) {
    const ids = candidates.map((h) => h._id);
    const msRaw = await dependencies.msearch([
      { index: MEDIA_INDEX },
      buildParagraphCosineBody(qv, ids),
      { index: MEDIA_INDEX },
      buildWindowCosineBody(qv, ids),
    ]);
    const responses = (msRaw as { responses?: unknown[] }).responses ?? [];
    const cosineByIdFrom = (resp: unknown) =>
      new Map(
        MediaSearchResponseSchema.parse(resp).hits.hits.map((h) => [
          h._id,
          (h._score ?? 1) - 1,
        ]),
      );
    const paragraphCosineById = cosineByIdFrom(responses[0]);
    const windowCosineById = cosineByIdFrom(responses[1]);
    pageHits = rerankByCosineSignals(candidates, [
      { cosineById: paragraphCosineById, weight: RERANK_W_PARAGRAPH },
      { cosineById: windowCosineById, weight: RERANK_W_WINDOW },
    ]).slice(from, from + size);
  } else {
    pageHits = candidates.slice(from, from + size);
  }

  // Stage 3: snippets for the page only.
  if (pageHits.length > 0) {
    const snippetRaw = await dependencies.search({
      index: MEDIA_INDEX,
      ...buildMediaSnippetBody(
        args,
        pageHits.map((h) => h._id),
      ),
    });
    const byId = new Map(
      MediaSearchResponseSchema.parse(snippetRaw).hits.hits.map((h) => [
        h._id,
        h.inner_hits,
      ]),
    );
    for (const hit of pageHits) {
      hit.inner_hits = byId.get(hit._id);
    }
  }

  return { hits: pageHits, total };
}

// Approximate kNN candidate pool + returned window count for the agent's
// on-demand semantic recall (below). Bounded and modest — this is a targeted,
// occasional query, not a hot-path fan-out.
const WINDOW_RECALL_K = 100;
const WINDOW_RECALL_SIZE = 12;

export type WindowRecallSpan = {
  uploadId: string;
  startOrder: number | null;
  endOrder: number | null;
  /** Seconds. */
  start: number | null;
  end: number | null;
  paras: Array<{ order: number; start: number; end: number; text: string }>;
};

/**
 * On-demand semantic RECALL over story-run windows — the §2a move from
 * docs/agentic-search-overview.md. Unlike the deterministic lane (exact-cosine
 * `script_score`, which only REORDERS the stage-1 pool), this issues a real
 * approximate `knn` against the nested `windows.embedding`, so it can PULL IN a
 * media that shares no keywords and whose summary never mentions the moment (the
 * keyword-free "granddaughter story" case). It is therefore the ONE caller that
 * warms the window HNSW graph into off-heap memory — deliberately paid visibly
 * and occasionally by the streaming agent, never on the instant lane. Returns
 * one contiguous window span (the top window) per matched media, newest match
 * first by score.
 */
export async function runWindowKnnRecall(args: {
  queryVector: number[];
  channelIds?: string[] | null;
  publishedAt?: PublishedAtRange | null;
  bibleRefs?: string[] | null;
  bibleBooks?: string[] | null;
  uploadIds?: string[] | null;
  k?: number;
  size?: number;
}): Promise<WindowRecallSpan[]> {
  const k = args.k ?? WINDOW_RECALL_K;
  const size = args.size ?? WINDOW_RECALL_SIZE;
  const filter = buildFilter(
    args.channelIds,
    args.publishedAt,
    args.bibleRefs,
    args.bibleBooks,
    null,
    args.uploadIds,
  );
  const raw = await osSearch({
    index: MEDIA_INDEX,
    size,
    _source: false,
    query: {
      bool: {
        filter,
        must: [
          {
            nested: {
              path: 'windows',
              score_mode: 'max',
              query: {
                knn: {
                  'windows.embedding': { vector: args.queryVector, k },
                },
              },
              inner_hits: {
                name: WINDOW_KNN,
                size: 1,
                _source: {
                  includes: [
                    'windows.startOrder',
                    'windows.endOrder',
                    'windows.start',
                    'windows.end',
                    'windows.paras',
                  ],
                },
              },
            },
          },
        ],
      },
    },
  });
  return MediaSearchResponseSchema.parse(raw).hits.hits.flatMap((hit) => {
    const src = hit.inner_hits?.[WINDOW_KNN]?.hits.hits[0]?._source;
    if (!src?.paras || src.paras.length === 0) return [];
    return [
      {
        uploadId: hit._id,
        startOrder: src.startOrder ?? null,
        endOrder: src.endOrder ?? null,
        start: src.start ?? null,
        end: src.end ?? null,
        paras: src.paras,
      },
    ];
  });
}

/**
 * Filter-only browse over lc_media_v1: no free-text query, so no BM25 / kNN /
 * RRF / rerank — just the access-control + facet filters, ordered newest-first
 * (or the caller's `sort`). Powers the facet-only search path (a
 * `/search?bibleRefs=[...]` link with no `q`, e.g. the study panel's "search
 * this verse" link), where relevance is meaningless and applying the facet is
 * the whole point. Returns the same `{ hits, total }` shape as
 * `runMediaHybridSearch` — hits carry `_id`; there are no snippet inner_hits.
 */
export async function runMediaFilterSearch(
  args: Pick<
    BuildMediaSearchArgs,
    | 'channelIds'
    | 'publishedAt'
    | 'bibleRefs'
    | 'bibleBooks'
    | 'speakers'
    | 'uploadIds'
    | 'paragraphSpeakers'
    | 'from'
    | 'size'
    | 'sort'
  >,
): Promise<{ hits: MediaHit[]; total: number }> {
  const from = args.from ?? 0;
  const size = args.size ?? 20;
  const { filter } = resolveFilter(args);
  const raw = await osSearch({
    index: MEDIA_INDEX,
    from,
    size,
    _source: false,
    query: { bool: { filter } },
    // Newest-first by default; the caller can override (e.g. a UI date sort).
    sort: args.sort ?? [{ publishedAt: 'desc' }],
  });
  const parsed = MediaSearchResponseSchema.parse(raw);
  return { hits: parsed.hits.hits, total: parsed.hits.total.value };
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
 *
 * `minScore` (a relative floor derived by runMediaFacets from the query's own
 * max_score) drops the weakly-matching tail so the facets track the results; see
 * FACET_MIN_SCORE_FRACTION. Omitted for the max_score probe.
 */
export function buildMediaFacetBody(
  args: BuildMediaSearchArgs,
  minScore?: number,
): OsMsearchItem {
  const trimmed = args.lexicalText.trim();
  const { filter, scopeToSpeaker } = resolveFilter(args);
  const facetsList = args.facets ?? [];
  const facetAggsPart =
    facetsList.length > 0
      ? {
          aggs: {
            sample: {
              sampler: { shard_size: FACET_SAMPLE_CAP },
              aggs: facetAggs(facetsList),
            },
          },
        }
      : {};

  // Filter-only browse (no free-text query — e.g. a `/search?bibleRefs=[...]`
  // link with no `q`): aggregate over the filtered set (match_all), with no
  // lexical `should` and no relative score floor (there's nothing to score).
  if (!trimmed) {
    return {
      size: 1,
      _source: false,
      query: { bool: { filter } },
      ...facetAggsPart,
    };
  }

  const should: OsQuery[] = [
    {
      multi_match: {
        query: trimmed,
        fields: ['title^2', 'description', 'summary', 'channelName'],
        analyzer: LEXICAL_QUERY_ANALYZER,
        // Require a real term overlap (matches the nested paragraph clause's
        // rule): `multi_match` defaults to OR, so without this a single stray
        // common word ("term") matches a whole doc — off-topic/gibberish queries
        // then surface loose OR-token noise. On the hybrid path the kNN relevance
        // probe used to suppress that; the lexical instant-results path (no
        // probe) relies on this floor instead. `2<70%`: ≤2 terms → all required,
        // >2 → 70% (stopwords already dropped by the `stop` analyzer). Applied to
        // both the result query and the facet query so facets match the results.
        minimum_should_match: '2<70%',
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
    // Relative-score floor: drop the weakly-matching tail so facets track the
    // results (adaptive per query — see FACET_MIN_SCORE_FRACTION).
    ...(minScore != null ? { min_score: minScore } : {}),
    query: { bool: { filter, should, minimum_should_match: 1 } },
    // Facet over the top-scored (most relevant) docs via `sampler`, so counts
    // reflect the results rather than the broad lexical match; FACET_SAMPLE_CAP
    // bounds it when a broad query clears the floor with many docs. A `sampler`
    // requires sub-aggs, so with no facets (the max_score probe, or the rare
    // all-filters-active body 0 nobody reads) emit a query-only body.
    ...facetAggsPart,
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
 * only 1–2 aggregation queries, growing to one per active filter (+1) at most.
 * The aggregation bodies are batched into one `_msearch` request. Each is a cheap
 * lexical aggregation body (`buildMediaFacetBody`) — NOT the hybrid query.
 */
export type MediaFacetSearchDependencies = {
  search: typeof osSearch;
  msearch: typeof osMsearch;
};

const defaultMediaFacetSearchDependencies: MediaFacetSearchDependencies = {
  search: osSearch,
  msearch: osMsearch,
};

export async function runMediaFacets(
  args: BuildMediaSearchArgs,
  dependencies: MediaFacetSearchDependencies = defaultMediaFacetSearchDependencies,
): Promise<{
  channels: Array<{ key: string; doc_count: number }>;
  speakers: Array<{ key: string; doc_count: number }>;
  verses: Array<{ key: string; doc_count: number }>;
  years: Array<{ year: string; doc_count: number }>;
}> {
  const base = { ...args, from: 0, size: 1, highlight: false };
  const hasQuery = base.lexicalText.trim().length > 0;

  // Probe for the query's top score so the facet floor can be relative to it
  // (FACET_MIN_SCORE_FRACTION). A query-only body (empty facet aggs) — one cheap
  // extra round-trip before the facet bodies, which then drop everything below
  // the floor. `min_score` is absolute, so this max_score can't be known upfront.
  // Skipped for filter-only browse (no query → nothing to score, and the
  // filter-only facet body applies no score floor anyway).
  let minScore: number | undefined;
  if (hasQuery) {
    const probeRaw = await dependencies.search({
      index: MEDIA_INDEX,
      ...buildMediaFacetBody({ ...base, facets: [] }),
    });
    const maxScore = (probeRaw as { hits?: { max_score?: number | null } }).hits
      ?.max_score;
    minScore =
      typeof maxScore === 'number'
        ? maxScore * FACET_MIN_SCORE_FRACTION
        : undefined;
  }

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
    buildMediaFacetBody({ ...base, facets: fullFacets }, minScore),
  ];
  const fullIndex = 0;
  const pushBody = (
    overrides: Partial<BuildMediaSearchArgs>,
    facets: MediaFacetKey[],
  ): number => {
    bodies.push(
      buildMediaFacetBody({ ...base, ...overrides, facets }, minScore),
    );
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

  // `_msearch` requires alternating metadata/body entries and preserves response
  // order, which is the body-index mapping used below. These remain plain lexical
  // aggregation queries: no RRF pipeline or other per-item URL parameters.
  const searches: OsMsearchItem[] = [];
  for (const body of bodies) {
    searches.push({ index: MEDIA_INDEX }, body);
  }
  const responses = parseMediaFacetMsearchResponses(
    await dependencies.msearch(searches),
    bodies.length,
  );
  const aggs = responses.map((response) => response.aggregations);

  // Facet buckets live under the `sample` sampler agg (see buildMediaFacetBody).
  return {
    channels: aggs[channelIndex]?.sample?.channelIds?.buckets ?? [],
    speakers: aggs[speakerIndex]?.sample?.speakers?.buckets ?? [],
    verses: aggs[scriptureIndex]?.sample?.bibleRefs?.buckets ?? [],
    years: (aggs[yearIndex]?.sample?.publishedYears?.buckets ?? []).map(
      (b) => ({
        year: b.key_as_string,
        doc_count: b.doc_count,
      }),
    ),
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

// The winning window's inline constituent paragraphs, for contiguous-span
// snippet reconstruction. `paras` come back from `_source` (mapping marks the
// nested `windows.paras` as `enabled: false`, so it is stored, not indexed).
const WindowInnerHitSchema = z.object({
  _source: z
    .object({
      startOrder: z.number().optional(),
      endOrder: z.number().optional(),
      start: z.number().optional(),
      end: z.number().optional(),
      paras: z
        .array(
          z.object({
            order: z.number(),
            start: z.number(),
            end: z.number(),
            text: z.string(),
          }),
        )
        .optional(),
    })
    .nullable(),
});

const WindowInnerHitsGroupSchema = z
  .object({
    hits: z.object({
      hits: z.array(WindowInnerHitSchema),
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
      [WINDOW_KNN]: WindowInnerHitsGroupSchema,
    })
    .partial()
    .optional(),
});

export const MediaSearchResponseSchema = z.object({
  hits: z.object({
    total: z.object({ value: z.number(), relation: z.string() }),
    hits: z.array(MediaHitSchema),
  }),
  // Facet aggs are nested under a `sample` sampler agg (buildMediaFacetBody), so
  // counts come from the top-scored docs, not the whole match set.
  aggregations: z
    .object({
      sample: z
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
    })
    .optional(),
});

const MediaFacetMsearchErrorSchema = z.object({
  status: z.number(),
  error: z.union([
    z.string(),
    z.object({
      type: z.string().optional(),
      reason: z.string(),
    }),
  ]),
});

const MediaFacetMsearchSuccessSchema = MediaSearchResponseSchema.extend({
  timed_out: z.boolean().optional(),
});

const MediaFacetMsearchResponseSchema = z.object({
  responses: z.array(
    z.union([MediaFacetMsearchSuccessSchema, MediaFacetMsearchErrorSchema]),
  ),
});

function parseMediaFacetMsearchResponses(
  raw: unknown,
  expectedCount: number,
): Array<z.infer<typeof MediaFacetMsearchSuccessSchema>> {
  const parsed = MediaFacetMsearchResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const location =
      issue && issue.path.length > 0 ? issue.path.join('.') : 'response';
    throw new Error(
      `Invalid media facet msearch response at ${location}: ${
        issue?.message ?? 'unknown response shape'
      }`,
    );
  }
  if (parsed.data.responses.length !== expectedCount) {
    throw new Error(
      `Media facet msearch returned ${parsed.data.responses.length} responses for ${expectedCount} bodies`,
    );
  }

  return parsed.data.responses.map((response, index) => {
    if ('error' in response) {
      const reason =
        typeof response.error === 'string'
          ? response.error
          : response.error.reason;
      throw new Error(
        `Media facet msearch item ${index} failed with status ${response.status}: ${reason}`,
      );
    }
    if (response.timed_out === true) {
      throw new Error(`Media facet msearch item ${index} timed out`);
    }
    return response;
  });
}

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
