import {
  MEDIA_INDEX,
  MEDIA_SEARCH_MAX_CANDIDATES,
  osSearch,
} from '@letschurch/opensearch';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { IncomingIdSchema } from '@/schemas/common';
import type { appRouter } from '@/trpc/router';
import { formatVerseRef } from '@/util/bible-url';
import logger from '@/util/logger';

import type {
  findChurchesTool,
  findFilterValuesOutput,
  findFilterValuesTool,
  getChannelOutput,
  getChannelTool,
  getRelatedSermonsOutput,
  getRelatedSermonsTool,
  getSeriesOutput,
  getSeriesTool,
  getSermonOutput,
  getSermonTool,
  getTranscriptOutput,
  getTranscriptTool,
  listChurchTagsOutput,
  searchSermonsOutput,
  searchSermonsTool,
  FilterKind,
  findChurchesOutput,
} from './tools';

const moduleLogger = logger.child({ module: 'mcp/handlers' });

const { WEB_URL } = z.object({ WEB_URL: z.string() }).parse(process.env);

export type Caller = ReturnType<typeof appRouter.createCaller>;
type Input<T extends { inputSchema: z.ZodType }> = z.infer<T['inputSchema']>;

/** An expected failure the agent should read and react to (bad id, etc.). */
export class ToolError extends Error {
  override name = 'ToolError';
}

// Same threshold the search page uses to fire its semantic fallback: a lexical
// pass with at most this many hits for a free-text query re-runs with
// `deep: true`. Decided on the lexical *total* so every page of one query takes
// the same path.
const DEEP_FALLBACK_MAX_RESULTS = 2;

// Did-you-mean lookups only run when a filtered search found nothing, and are
// capped so a long filter list can't fan out into many palette queries.
const MAX_DID_YOU_MEAN_LOOKUPS = 3;

// ---------------------------------------------------------------------------
// Shared shaping
// ---------------------------------------------------------------------------

const mediaUrl = (id: string) => `${WEB_URL}/media/${id}`;
const timestampUrl = (id: string, sec: number) =>
  `${mediaUrl(id)}#t=${Math.floor(sec)}`;
const channelUrl = (slug: string) =>
  `${WEB_URL}/channel/${encodeURIComponent(slug)}`;
const churchUrl = (slug: string) =>
  `${WEB_URL}/churches/${encodeURIComponent(slug)}`;
const seriesUrl = (id: string) => `${WEB_URL}/series/${id}`;

// Search snippets carry BM25 highlight markup; agents get plain text.
const stripMarks = (text: string) => text.replace(/<\/?mark>/g, '');

const toIso = (value: Date | string | null) =>
  value instanceof Date ? value.toISOString() : value;

function mediaSummary(media: {
  id: string;
  title: string | null;
  publishedAt: Date | string | null;
  lengthSeconds: number | null;
  channel: { slug: string; name: string };
}) {
  return {
    id: media.id,
    title: media.title ?? '',
    url: mediaUrl(media.id),
    channel: {
      slug: media.channel.slug,
      name: media.channel.name,
      url: channelUrl(media.channel.slug),
    },
    publishedAt: toIso(media.publishedAt),
    durationSec: media.lengthSeconds,
  };
}

/** Media ids are short base58 at the boundary; an unparseable one is unknown. */
function mediaUuid(id: string): string {
  const parsed = IncomingIdSchema.safeParse(id);
  if (!parsed.success) throw new ToolError(`No sermon with id "${id}".`);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// find_filter_values
// ---------------------------------------------------------------------------

type FilterValuesResult = z.infer<typeof findFilterValuesOutput>;
type SuggestResult = Awaited<ReturnType<Caller['search']['suggest']>>;

/** Reshape the palette's facet groups into exact filter values by kind. */
function filterValuesFromSuggest(
  suggest: SuggestResult,
  limit: number,
): FilterValuesResult {
  const rowsOf = (kind: SuggestResult['facetGroups'][number]['kind']) =>
    (suggest.facetGroups.find((g) => g.kind === kind)?.rows ?? [])
      .slice(0, limit)
      .map((r) => ({ value: r.value, label: r.label, count: r.count }));

  return {
    speakers: rowsOf('speakers'),
    channels: rowsOf('channels').map((r) => ({
      ...r,
      url: channelUrl(r.value),
    })),
    books: rowsOf('scripture'),
    verses: rowsOf('verses'),
    years: rowsOf('year'),
  };
}

export async function findFilterValues(
  caller: Caller,
  input: Input<typeof findFilterValuesTool>,
): Promise<FilterValuesResult> {
  const values = filterValuesFromSuggest(
    await caller.search.suggest({ q: input.query }),
    input.limit,
  );
  if (!input.kinds) return values;

  const keep = new Set<z.infer<typeof FilterKind>>(input.kinds);
  return {
    speakers: keep.has('speaker') ? values.speakers : [],
    channels: keep.has('channel') ? values.channels : [],
    books: keep.has('book') ? values.books : [],
    verses: keep.has('verse') ? values.verses : [],
    years: keep.has('year') ? values.years : [],
  };
}

// ---------------------------------------------------------------------------
// search_sermons
// ---------------------------------------------------------------------------

type SearchSermonsResult = z.infer<typeof searchSermonsOutput>;
type HybridSearchInput = Parameters<Caller['search']['hybridSearch']>[0];
type HybridSearchResult = Awaited<ReturnType<Caller['search']['hybridSearch']>>;

async function runHybridSearch(
  caller: Caller,
  args: HybridSearchInput,
): Promise<HybridSearchResult> {
  const lexical = await caller.search.hybridSearch(args);
  if (
    (args.q ?? '').trim() === '' ||
    lexical.mediaCount > DEEP_FALLBACK_MAX_RESULTS
  ) {
    return lexical;
  }
  try {
    const deep = await caller.search.hybridSearch({ ...args, deep: true });
    return deep.mediaCount > lexical.mediaCount ? deep : lexical;
  } catch (error) {
    // The deep pass spends the AI budget (embedding); when that's exhausted or
    // the embed fails, the lexical result is still a valid answer.
    moduleLogger.warn(
      { err: error instanceof Error ? error : new Error(String(error)) },
      'MCP deep search fallback failed; using lexical results',
    );
    return lexical;
  }
}

/**
 * For a filtered search that found nothing, look up each speaker/channel filter
 * value; the ones with no exact match get near matches so the agent can retry
 * with a corrected value in one turn.
 */
async function findUnmatchedFilters(
  caller: Caller,
  input: Input<typeof searchSermonsTool>,
): Promise<SearchSermonsResult['unmatchedFilters']> {
  const candidates = [
    ...(input.speakers ?? []).map((value) => ({
      kind: 'speaker' as const,
      value,
    })),
    ...(input.channels ?? []).map((value) => ({
      kind: 'channel' as const,
      value,
    })),
  ].slice(0, MAX_DID_YOU_MEAN_LOOKUPS);

  // Independent, conditionally issued lookups (zero-result path only, ≤3), so
  // they go through the existing `suggest` procedure rather than a bespoke
  // msearch — see CLAUDE.md's msearch exemption.
  const lookups = await Promise.all(
    candidates.map(async (candidate) => {
      // For channels, the slug is a poor text query; its words usually match the
      // channel name, which the palette searches.
      const q =
        candidate.kind === 'channel'
          ? candidate.value.replace(/[-_]+/g, ' ')
          : candidate.value;
      const values = filterValuesFromSuggest(
        await caller.search.suggest({ q }),
        5,
      );
      const near =
        candidate.kind === 'speaker' ? values.speakers : values.channels;
      if (near.some((n) => n.value === candidate.value)) return null;
      return {
        kind: candidate.kind,
        value: candidate.value,
        didYouMean: near.map(({ value, label, count }) => ({
          value,
          label,
          count,
        })),
      };
    }),
  );
  return lookups.filter((l) => l !== null);
}

export async function searchSermons(
  caller: Caller,
  input: Input<typeof searchSermonsTool>,
): Promise<SearchSermonsResult> {
  const hasFilter = Boolean(
    input.speakers?.length ||
    input.channels?.length ||
    input.verses?.length ||
    input.books?.length ||
    input.publishedAfter ||
    input.publishedBefore,
  );
  if (input.query.trim() === '' && !hasFilter) {
    throw new ToolError('Provide a query, at least one filter, or both.');
  }

  const result = await runHybridSearch(caller, {
    q: input.query,
    quotes: input.exactPhrases ?? null,
    speakers: input.speakers ?? null,
    channelSlugs: input.channels ?? null,
    bibleRefs: input.verses ?? null,
    bibleBooks: input.books ?? null,
    dateGte: input.publishedAfter ?? null,
    dateLte: input.publishedBefore ?? null,
    sort:
      input.sort === 'newest'
        ? 'date-desc'
        : input.sort === 'oldest'
          ? 'date-asc'
          : 'relevance',
    // hybridSearch rejects windows past the candidate cap.
    limit: Math.min(input.limit, MEDIA_SEARCH_MAX_CANDIDATES - input.offset),
    cursor: input.offset,
  });

  const unmatchedFilters =
    result.mediaCount === 0 && hasFilter
      ? await findUnmatchedFilters(caller, input)
      : [];

  return {
    results: result.items.map((item) => ({
      ...mediaSummary(item),
      matches: item.segments.map((segment) => {
        // MediaSegment times are milliseconds; the tool contract is seconds.
        const startSec = segment.start / 1000;
        return {
          startSec,
          endSec: segment.end / 1000,
          text: stripMarks(segment.text),
          paragraph: segment.order ?? null,
          url: timestampUrl(item.id, startSec),
        };
      }),
    })),
    totalMatches: result.mediaCount,
    nextOffset: result.nextCursor,
    refine: {
      speakers: result.facetedSpeakers.map((s) => ({
        value: s.name,
        label: s.name,
        count: s.count,
      })),
      channels: result.facetedChannels.map((c) => ({
        value: c.slug,
        label: c.name,
        url: channelUrl(c.slug),
      })),
      verses: result.facetedVerses.map((v) => ({
        value: v.ref,
        label: v.label,
        count: v.count,
      })),
      years: result.facetedYears.map((y) => ({
        value: y.year,
        label: y.year,
        count: y.count,
      })),
    },
    unmatchedFilters,
  };
}

// ---------------------------------------------------------------------------
// get_sermon
// ---------------------------------------------------------------------------

const MAX_SERMON_SCRIPTURE_REFS = 100;

const IndexRollupSchema = z.object({
  hits: z.object({
    hits: z.array(
      z.object({
        _source: z
          .object({
            speakers: z.array(z.string()).optional(),
            bibleRefs: z.array(z.string()).optional(),
          })
          .optional(),
      }),
    ),
  }),
});

/**
 * Speakers and cited verses as the search index rolls them up — the exact
 * strings search_sermons filters on. Runs in parallel with getMediaById, and
 * the result is discarded unless that authorizes the media, so nothing about
 * an unviewable upload is returned.
 */
async function indexRollups(uuid: string) {
  try {
    const raw = await osSearch({
      index: MEDIA_INDEX,
      size: 1,
      _source: ['speakers', 'bibleRefs'],
      query: { ids: { values: [uuid] } },
    });
    const source = IndexRollupSchema.parse(raw).hits.hits[0]?._source;
    return {
      speakers: source?.speakers ?? [],
      bibleRefs: source?.bibleRefs ?? [],
    };
  } catch (error) {
    // Details are still useful without the rollups (e.g. not yet indexed).
    moduleLogger.warn(
      { err: error instanceof Error ? error : new Error(String(error)) },
      'MCP get_sermon index rollup failed',
    );
    return { speakers: [], bibleRefs: [] };
  }
}

export async function getSermon(
  caller: Caller,
  input: Input<typeof getSermonTool>,
): Promise<z.infer<typeof getSermonOutput>> {
  const uuid = mediaUuid(input.id);
  const [media, rollups] = await Promise.all([
    caller.media.getMediaById({ mediaId: input.id }),
    indexRollups(uuid),
  ]);
  if (!media) throw new ToolError(`No sermon with id "${input.id}".`);

  return {
    ...mediaSummary(media),
    speakers: rollups.speakers,
    hasTranscript: media.transcribingFinishedAt !== null,
    isLive: media.isLive,
    viewCount: media.viewCount,
    description: media.description,
    summary: media.summary,
    outline: media.outline.map((section) => ({
      title: section.title,
      description: section.description,
      startSec: section.startSeconds,
      endSec: section.endSeconds,
      url: timestampUrl(media.id, section.startSeconds),
    })),
    scriptureRefs: rollups.bibleRefs
      .slice(0, MAX_SERMON_SCRIPTURE_REFS)
      .map((ref) => ({ ref, label: formatVerseRef(ref) })),
    series: media.series
      ? {
          id: media.series.id,
          title: media.series.title,
          url: seriesUrl(media.series.id),
        }
      : null,
    license: media.license,
  };
}

// ---------------------------------------------------------------------------
// get_transcript
// ---------------------------------------------------------------------------

const BibleAnnotationSchema = z.object({
  book: z.string(),
  chapter: z.number().int(),
  verse: z.number().int(),
});

export async function getTranscript(
  caller: Caller,
  input: Input<typeof getTranscriptTool>,
): Promise<z.infer<typeof getTranscriptOutput>> {
  if (input.fromParagraph !== undefined && input.fromSec !== undefined) {
    throw new ToolError('Use fromParagraph or fromSec, not both.');
  }
  mediaUuid(input.id);
  const paragraphs = await caller.media.getTranscriptParagraphs({
    mediaId: input.id,
  });
  if (!paragraphs) {
    throw new ToolError(
      `No transcript for "${input.id}" (unknown sermon or not transcribed yet).`,
    );
  }

  const ordered = [...paragraphs].sort((a, b) => a.order - b.order);
  let startIndex = 0;
  if (input.fromParagraph !== undefined) {
    const from = input.fromParagraph;
    startIndex = ordered.findIndex((p) => p.order >= from);
  } else if (input.fromSec !== undefined) {
    const from = input.fromSec;
    startIndex = ordered.findIndex((p) => p.end > from);
  }
  const window =
    startIndex === -1
      ? []
      : ordered.slice(startIndex, startIndex + input.maxParagraphs);
  const after =
    startIndex === -1 ? undefined : ordered[startIndex + window.length];

  const outline = ordered.flatMap((p) =>
    p.annotations
      .filter((a) => a.kind === 'OUTLINE')
      .map((a) => ({
        title:
          typeof a.metadata.title === 'string'
            ? a.metadata.title
            : 'Untitled section',
        paragraph: p.order,
        startSec: p.start,
        url: timestampUrl(input.id, p.start),
      })),
  );

  const scriptureRefs = window.flatMap((p) =>
    p.annotations.flatMap((a) => {
      if (a.kind !== 'BIBLE') return [];
      const parsed = BibleAnnotationSchema.safeParse(a.metadata);
      if (!parsed.success) return [];
      const { book, chapter, verse } = parsed.data;
      const ref = `${book}.${chapter}.${verse}`;
      return [{ ref, label: formatVerseRef(ref), paragraph: p.order }];
    }),
  );

  return {
    id: input.id,
    url: mediaUrl(input.id),
    paragraphs: window.map((p) => ({
      paragraph: p.order,
      startSec: p.start,
      endSec: p.end,
      speaker: p.speakerName,
      text: p.text,
      url: timestampUrl(input.id, p.start),
    })),
    outline,
    scriptureRefs,
    totalParagraphs: ordered.length,
    nextParagraph: after?.order ?? null,
  };
}

// ---------------------------------------------------------------------------
// get_related_sermons
// ---------------------------------------------------------------------------

export async function getRelatedSermons(
  caller: Caller,
  input: Input<typeof getRelatedSermonsTool>,
): Promise<z.infer<typeof getRelatedSermonsOutput>> {
  mediaUuid(input.id);
  const related = await caller.media.getRelatedMedia({
    mediaId: input.id,
    limit: input.limit,
  });
  const shape = (items: typeof related.sameChannel) =>
    items.map((item) =>
      mediaSummary({
        ...item,
        channel: { slug: item.channelSlug, name: item.channelName },
      }),
    );
  return {
    sameChannel: shape(related.sameChannel),
    otherChannels: shape(related.otherChannels),
  };
}

// ---------------------------------------------------------------------------
// get_channel
// ---------------------------------------------------------------------------

export async function getChannel(
  caller: Caller,
  input: Input<typeof getChannelTool>,
): Promise<z.infer<typeof getChannelOutput>> {
  const channel = await caller.channel.getChannelBySlug({ slug: input.slug });
  if (!channel) {
    throw new ToolError(
      `No channel "${input.slug}". Use find_filter_values to look up slugs.`,
    );
  }

  // One filter-only search gives both the newest sermons and the facets
  // (speakers, verses, years) scoped to this channel.
  const [churches, browse, live] = await Promise.all([
    caller.channel.getChannelChurches({ slug: input.slug }),
    caller.search.hybridSearch({
      q: '',
      channelSlugs: [input.slug],
      sort: 'date-desc',
      limit: input.recent,
      cursor: 0,
    }),
    channel.isLive
      ? caller.channel.getLatestLiveStream({ slug: input.slug })
      : null,
  ]);

  return {
    channel: {
      slug: channel.slug,
      name: channel.name,
      url: channelUrl(channel.slug),
      description: channel.description,
      websiteUrl: channel.websiteUrl,
      subscriberCount: channel.subscriberCount,
      sermonCount: channel.uploadCount,
      isLiveNow: channel.isLive,
      liveUrl: live ? mediaUrl(live.mediaId) : null,
    },
    churches: churches.map((church) => ({
      slug: church.slug,
      name: church.name,
      url: churchUrl(church.slug),
      isOfficial: church.isOfficial,
    })),
    speakers: browse.facetedSpeakers.map((s) => ({
      value: s.name,
      label: s.name,
      count: s.count,
    })),
    topVerses: browse.facetedVerses.map((v) => ({
      value: v.ref,
      label: v.label,
      count: v.count,
    })),
    years: browse.facetedYears.map((y) => ({
      value: y.year,
      label: y.year,
      count: y.count,
    })),
    recent: browse.items.map(mediaSummary),
  };
}

// ---------------------------------------------------------------------------
// get_series
// ---------------------------------------------------------------------------

export async function getSeries(
  caller: Caller,
  input: Input<typeof getSeriesTool>,
): Promise<z.infer<typeof getSeriesOutput>> {
  const notFound = new ToolError(`No series with id "${input.id}".`);
  if (!IncomingIdSchema.safeParse(input.id).success) throw notFound;
  const [series, media] = await Promise.all([
    caller.series.getPublicSeries({ seriesId: input.id }),
    caller.series.getPublicSeriesMedia({
      seriesId: input.id,
      limit: input.limit,
      cursor: input.cursor ?? null,
    }),
  ]).catch((error: unknown) => {
    throw error instanceof TRPCError && error.code === 'NOT_FOUND'
      ? notFound
      : error;
  });
  if (!series) throw notFound;

  return {
    id: series.id,
    title: series.title,
    url: seriesUrl(series.id),
    channel: series.channel
      ? {
          slug: series.channel.slug,
          name: series.channel.name,
          url: channelUrl(series.channel.slug),
        }
      : null,
    sermonCount: series.mediaCount,
    items: media.items.map(mediaSummary),
    nextCursor: media.nextCursor ?? null,
  };
}

// ---------------------------------------------------------------------------
// find_churches / list_church_tags
// ---------------------------------------------------------------------------

const EARTH_RADIUS_MILES = 3958.8;

function distanceMiles(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

export async function findChurches(
  caller: Caller,
  input: Input<typeof findChurchesTool>,
): Promise<z.infer<typeof findChurchesOutput>> {
  const { items, total } = await caller.church.searchChurches({
    lat: input.lat,
    lon: input.lon,
    range: `${input.radiusMiles}mi`,
    tags: input.tags ?? null,
    limit: input.limit,
  });

  const churches = items.map((church) => {
    const address = church.addresses.find(
      (a) => a.latitude !== null && a.longitude !== null,
    );
    return {
      slug: church.slug,
      name: church.name,
      url: churchUrl(church.slug),
      website: church.websiteUrl,
      address: address
        ? [
            address.streetAddress,
            address.locality,
            address.region,
            address.postalCode,
            address.country,
          ]
            .filter(Boolean)
            .join(', ')
        : null,
      distanceMiles:
        address?.latitude != null && address.longitude != null
          ? Math.round(
              distanceMiles(input, {
                lat: address.latitude,
                lon: address.longitude,
              }) * 10,
            ) / 10
          : null,
      tags: church.tags.map((tag) => ({
        slug: tag.slug,
        label: tag.label,
        category: tag.category,
      })),
    };
  });
  churches.sort(
    (a, b) =>
      (a.distanceMiles ?? Number.POSITIVE_INFINITY) -
      (b.distanceMiles ?? Number.POSITIVE_INFINITY),
  );
  return { churches, total };
}

export async function listChurchTags(
  caller: Caller,
): Promise<z.infer<typeof listChurchTagsOutput>> {
  const tags = await caller.church.getOrganizationTags();
  return {
    tags: tags.map((tag) => ({
      slug: tag.slug,
      label: tag.label,
      category: tag.category,
    })),
  };
}
