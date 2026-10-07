// Let's Church MCP server tool contracts.
//
// The *agent-facing* shape of each tool, kept separate from the tRPC procedures
// that back them so a UI refactor can't silently change what agents see.
// Handlers (thin wrappers over `appRouter.createCaller(ctx)`) live in
// ./handler.server.ts.
//
// Conventions shared by every tool:
// - All v1 tools are read-only and public. `ctx` is built from the MCP request
//   (anonymous for now), never from a client-supplied user id — see
//   docs/security.md. Private/unlisted media stay invisible because the wrapped
//   procedures already run `canViewMedia`.
// - Times are **seconds** (the search index's `MediaSegment` is milliseconds and
//   the DB is seconds; the wrappers normalize to seconds).
// - Text is plain: the wrappers strip search-highlight `<mark>` tags.
// - Every media-ish object carries an absolute `url`; every transcript span
//   carries a `url` that deep-links to its timestamp (`/media/<id>#t=<sec>`, the
//   same form answer-panel.tsx emits). Agents are told to cite these.
// - Ids are the short (base58) outgoing ids the site uses in URLs.
// - Filter values are exact. `find_filter_values` is how an agent learns them,
//   and `search_sermons` echoes the exact values it saw (`refine`) so the agent
//   can narrow without guessing.
import {
  MEDIA_SEARCH_MAX_CANDIDATES,
  MEDIA_SEARCH_MAX_PAGE_SIZE,
} from '@letschurch/opensearch';
import { z } from 'zod';

import {
  SEARCH_FILTER_MAX_ITEMS,
  SEARCH_QUERY_MAX_LENGTH,
} from '@/trpc/procedures/search';

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const MediaId = z
  .string()
  .max(64)
  .describe("A Let's Church media id, as returned by other tools.");

const Url = z.string().url();

const Seconds = z.number().nonnegative();

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe('Calendar date, YYYY-MM-DD, inclusive.');

const OsisVerse = z
  .string()
  .regex(/^[1-3]?[A-Za-z]+\.\d+\.\d+$/)
  .describe('OSIS verse reference, e.g. "John.3.16", "1Cor.13.4", "Ps.23.1".');

const OsisBook = z
  .string()
  .regex(/^[1-3]?[A-Za-z]+$/)
  .describe('OSIS book id, e.g. "Rom", "Gen", "1John", "Ps".');

const ChannelRef = z.object({
  slug: z.string(),
  name: z.string(),
  url: Url,
});

/** A matched transcript passage inside a search hit. */
const TranscriptSpan = z.object({
  startSec: Seconds,
  endSec: Seconds,
  text: z.string(),
  /** Paragraph number; pass to `get_transcript.fromParagraph` to read on. */
  paragraph: z.number().int().nullable(),
  url: Url.describe('Opens the media at this passage.'),
});

/** Compact media summary used in every list result. */
const MediaSummary = z.object({
  id: MediaId,
  title: z.string(),
  url: Url,
  channel: ChannelRef,
  publishedAt: z.string().nullable().describe('ISO 8601 timestamp.'),
  durationSec: Seconds.nullable(),
});

const FacetCount = z.object({
  value: z.string().describe('Exact value to pass back as a filter.'),
  label: z.string(),
  count: z.number().int(),
});

// ---------------------------------------------------------------------------
// find_filter_values  — backed by suggestMediaPalette (search.suggest)
// ---------------------------------------------------------------------------

export const FilterKind = z.enum([
  'speaker',
  'channel',
  'book',
  'verse',
  'year',
]);

export const findFilterValuesInput = z.object({
  query: z
    .string()
    .min(1)
    .max(200)
    .describe('Partial or approximate name, e.g. "macarthur", "romans 8".'),
  kinds: z
    .array(FilterKind)
    .min(1)
    .optional()
    .describe('Restrict to these filter kinds. Default: all.'),
  // search.suggest caps each group at 6 rows.
  limit: z.number().int().min(1).max(6).default(6).describe('Per kind.'),
});

export const findFilterValuesOutput = z.object({
  speakers: z.array(FacetCount),
  channels: z.array(FacetCount.extend({ url: Url })),
  books: z.array(FacetCount),
  verses: z.array(FacetCount),
  years: z.array(FacetCount),
});

export const findFilterValuesTool = {
  name: 'find_filter_values',
  title: 'Find exact filter values',
  description:
    'Resolve a fuzzy name to the exact speaker names, channel slugs, Bible ' +
    'books/verses and years that `search_sermons` filters accept, each with ' +
    'the number of sermons it matches. Call this before filtering by speaker ' +
    'or channel — those filters are exact-match and a guessed spelling ' +
    'returns nothing.',
  inputSchema: findFilterValuesInput,
  outputSchema: findFilterValuesOutput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
} as const;

// ---------------------------------------------------------------------------
// search_sermons  — backed by search.hybridSearch
// ---------------------------------------------------------------------------

export const searchSermonsInput = z.object({
  query: z
    .string()
    .max(SEARCH_QUERY_MAX_LENGTH)
    .default('')
    .describe(
      'Topic, question, phrase or title words. May be empty when filtering ' +
        '(e.g. all sermons on Rom.8 by one speaker).',
    ),
  exactPhrases: z
    .array(z.string().max(200))
    .max(8)
    .optional()
    .describe('Phrases to boost as verbatim matches (maps to `quotes`).'),
  speakers: z
    .array(z.string().max(256))
    .max(SEARCH_FILTER_MAX_ITEMS)
    .optional()
    .describe('Exact speaker names from find_filter_values. OR semantics.'),
  channels: z
    .array(z.string().max(128))
    .max(SEARCH_FILTER_MAX_ITEMS)
    .optional()
    .describe('Exact channel slugs from find_filter_values. OR semantics.'),
  verses: z
    .array(OsisVerse)
    .max(SEARCH_FILTER_MAX_ITEMS)
    .optional()
    .describe('Sermons that cite any of these verses.'),
  books: z
    .array(OsisBook)
    .max(SEARCH_FILTER_MAX_ITEMS)
    .optional()
    .describe('Sermons that cite any passage in these books.'),
  publishedAfter: IsoDate.optional(),
  publishedBefore: IsoDate.optional(),
  sort: z.enum(['relevance', 'newest', 'oldest']).default('relevance'),
  limit: z.number().int().min(1).max(MEDIA_SEARCH_MAX_PAGE_SIZE).default(10),
  offset: z
    .number()
    .int()
    .min(0)
    .max(MEDIA_SEARCH_MAX_CANDIDATES - 1)
    .default(0)
    .describe(
      `Pagination. Results are capped at the top ${MEDIA_SEARCH_MAX_CANDIDATES}; ` +
        'narrow with filters rather than paging deep.',
    ),
});

export const searchSermonsOutput = z.object({
  results: z.array(
    MediaSummary.extend({
      matches: z
        .array(TranscriptSpan)
        .describe('Transcript passages that matched the query, best first.'),
    }),
  ),
  totalMatches: z.number().int(),
  nextOffset: z.number().int().nullable(),
  /** Exact values present in this result set, for narrowing. */
  refine: z.object({
    speakers: z.array(FacetCount),
    // The search facet hydrates channels without their counts.
    channels: z.array(
      z.object({ value: z.string(), label: z.string(), url: Url }),
    ),
    verses: z.array(FacetCount),
    years: z.array(FacetCount),
  }),
  /**
   * Filter values that matched nothing, with near matches from the same lookup
   * `find_filter_values` uses. Lets the agent self-correct in one turn.
   */
  unmatchedFilters: z.array(
    z.object({
      kind: FilterKind,
      value: z.string(),
      didYouMean: z.array(FacetCount),
    }),
  ),
});

export const searchSermonsTool = {
  name: 'search_sermons',
  title: 'Search sermons',
  description:
    "Search Let's Church sermons and teaching by meaning and keywords across " +
    'titles, summaries and full transcripts. Filter by speaker, channel, ' +
    'Bible verse/book and publish date. Each result includes the matching ' +
    'transcript passages with timestamped links — cite those links when ' +
    'quoting. Use `refine` to narrow, and `get_transcript` to read more ' +
    'around a passage.',
  inputSchema: searchSermonsInput,
  outputSchema: searchSermonsOutput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
} as const;
// Wrapper notes:
// - Runs the lexical pass, then re-runs with `deep: true` when it comes back
//   empty/sparse — the same fallback the web client drives. `deep` is not an
//   agent-facing knob.
// - The lexical pass is logged to search_log like any anonymous web search
//   (`skipLogging` is honored only for admins), so MCP queries count toward
//   search analytics. Add a source marker to the log row if we need to split
//   them out.

// ---------------------------------------------------------------------------
// get_sermon  — media.getMediaById + the search index's speaker/verse rollups
// ---------------------------------------------------------------------------

export const getSermonInput = z.object({ id: MediaId });

export const getSermonOutput = MediaSummary.extend({
  speakers: z
    .array(z.string())
    .describe('Exact speaker names, usable as search_sermons filters.'),
  hasTranscript: z.boolean(),
  isLive: z.boolean(),
  viewCount: z.number().int(),
  description: z.string().nullable(),
  summary: z.string().nullable().describe('Machine-generated summary.'),
  outline: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().nullable(),
        startSec: Seconds,
        endSec: Seconds,
        url: Url,
      }),
    )
    .describe('Chapter markers, when available.'),
  scriptureRefs: z
    .array(z.object({ ref: z.string(), label: z.string() }))
    .describe('Verses cited in the sermon (OSIS refs).'),
  series: z
    .object({ id: z.string(), title: z.string(), url: Url })
    .nullable()
    .describe('The public series this sermon belongs to, if any.'),
  license: z.string().nullable(),
});

export const getSermonTool = {
  name: 'get_sermon',
  title: 'Get sermon details',
  description:
    'Full details for one sermon: description, summary, chapter outline, ' +
    'speakers, cited Scripture, series and license. Does not include the ' +
    'transcript — use get_transcript.',
  inputSchema: getSermonInput,
  outputSchema: getSermonOutput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
} as const;

// ---------------------------------------------------------------------------
// get_transcript  — media.getTranscriptParagraphs
// ---------------------------------------------------------------------------

export const MAX_TRANSCRIPT_WINDOW = 200;

export const getTranscriptInput = z.object({
  id: MediaId,
  fromParagraph: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Start the window at this paragraph number (from a search match, the ' +
        'outline, or nextParagraph). For context before a search match, ' +
        'start a couple of paragraphs earlier. Mutually exclusive with fromSec.',
    ),
  fromSec: Seconds.optional().describe('Start the window at this time.'),
  maxParagraphs: z.number().int().min(1).max(MAX_TRANSCRIPT_WINDOW).default(40),
});

export const getTranscriptOutput = z.object({
  id: MediaId,
  url: Url,
  paragraphs: z.array(
    z.object({
      paragraph: z.number().int(),
      startSec: Seconds,
      endSec: Seconds,
      speaker: z.string().nullable().describe('Attributed speaker name.'),
      text: z.string(),
      url: Url,
    }),
  ),
  /** OUTLINE annotations across the whole sermon, for navigation. */
  outline: z.array(
    z.object({
      title: z.string(),
      paragraph: z.number().int(),
      startSec: Seconds,
      url: Url,
    }),
  ),
  /** BIBLE annotations within the returned window. */
  scriptureRefs: z.array(
    z.object({
      ref: z.string(),
      label: z.string(),
      paragraph: z.number().int(),
    }),
  ),
  totalParagraphs: z.number().int(),
  /** The next unread paragraph; pass as `fromParagraph` to keep reading. */
  nextParagraph: z.number().int().nullable(),
});

export const getTranscriptTool = {
  name: 'get_transcript',
  title: 'Read a sermon transcript',
  description:
    'Read a window of a sermon transcript with speaker names and timestamps. ' +
    'Defaults to the first 40 paragraphs; pass fromParagraph (from a search ' +
    'match or the outline) or fromSec to jump. The full outline is always ' +
    'returned so you can navigate long sermons without reading them whole. ' +
    'Keep reading by passing nextParagraph as fromParagraph.',
  inputSchema: getTranscriptInput,
  outputSchema: getTranscriptOutput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
} as const;

// ---------------------------------------------------------------------------
// get_related_sermons  — media.getRelatedMedia
// ---------------------------------------------------------------------------

export const getRelatedSermonsInput = z.object({
  id: MediaId,
  limit: z.number().int().min(1).max(24).default(6).describe('Per list.'),
});

export const getRelatedSermonsOutput = z.object({
  sameChannel: z.array(MediaSummary),
  otherChannels: z.array(MediaSummary),
});

export const getRelatedSermonsTool = {
  name: 'get_related_sermons',
  title: 'Find related sermons',
  description:
    'Sermons similar in topic to the given one, split into the same ' +
    'channel and other channels. Empty when the sermon has no summary yet.',
  inputSchema: getRelatedSermonsInput,
  outputSchema: getRelatedSermonsOutput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
} as const;

// ---------------------------------------------------------------------------
// get_channel  — channel.getChannelBySlug + getChannelChurches + a filter-only
// hybridSearch (facets + newest sermons)
// ---------------------------------------------------------------------------

export const getChannelInput = z.object({
  slug: z.string().max(128).describe('Exact channel slug.'),
  recent: z.number().int().min(1).max(20).default(5),
});

export const getChannelOutput = z.object({
  channel: ChannelRef.extend({
    description: z.string().nullable(),
    websiteUrl: z.string().nullable(),
    subscriberCount: z.number().int(),
    sermonCount: z.number().int(),
    isLiveNow: z.boolean(),
    liveUrl: Url.nullable().describe('The live broadcast, while live.'),
  }),
  churches: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      url: Url,
      isOfficial: z.boolean(),
    }),
  ),
  speakers: z.array(FacetCount).describe('Who preaches here, most first.'),
  topVerses: z.array(FacetCount).describe('Most-cited verses.'),
  years: z.array(FacetCount),
  recent: z.array(MediaSummary).describe('Newest sermons.'),
});

export const getChannelTool = {
  name: 'get_channel',
  title: 'Get channel profile',
  description:
    'A ministry/channel profile: description, linked churches, whether it ' +
    'is live now, who preaches there, its most-cited verses, and its latest ' +
    'sermons. To list more of its sermons use search_sermons with ' +
    '`channels: [slug]` and `sort: "newest"`.',
  inputSchema: getChannelInput,
  outputSchema: getChannelOutput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
} as const;

// ---------------------------------------------------------------------------
// get_series  — series.getPublicSeries + getPublicSeriesMedia
// ---------------------------------------------------------------------------

export const getSeriesInput = z.object({
  id: z.string().max(64).describe('Series id, as returned by get_sermon.'),
  limit: z.number().int().min(1).max(50).default(50),
  cursor: z
    .string()
    .max(512)
    .optional()
    .describe('nextCursor from a previous call.'),
});

export const getSeriesOutput = z.object({
  id: z.string(),
  title: z.string(),
  url: Url,
  channel: ChannelRef.nullable(),
  sermonCount: z.number().int(),
  items: z.array(MediaSummary).describe('Sermons in series order.'),
  nextCursor: z.string().nullable(),
});

export const getSeriesTool = {
  name: 'get_series',
  title: 'Get sermon series',
  description:
    'A sermon series and its sermons in order — e.g. a verse-by-verse ' +
    'walk through a book.',
  inputSchema: getSeriesInput,
  outputSchema: getSeriesOutput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
} as const;

// ---------------------------------------------------------------------------
// find_churches  — church.searchChurches
// ---------------------------------------------------------------------------

export const findChurchesInput = z.object({
  lat: z
    .number()
    .min(-90)
    .max(90)
    .describe('Latitude to search around; approximate city coordinates work.'),
  lon: z.number().min(-180).max(180).describe('Longitude to search around.'),
  radiusMiles: z.number().min(1).max(250).default(25),
  tags: z
    .array(z.string().max(64))
    // searchChurches requires every tag for up to three, and only most of
    // them beyond that; capping at three keeps "has all of these" exact.
    .max(3)
    .optional()
    .describe(
      'Up to 3 tag slugs from list_church_tags; a church must have all.',
    ),
  limit: z.number().int().min(1).max(50).default(15),
});

export const findChurchesOutput = z.object({
  churches: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      url: Url,
      website: z.string().nullable(),
      address: z.string().nullable().describe('Meeting address.'),
      distanceMiles: z.number().nullable(),
      tags: z.array(
        z.object({ slug: z.string(), label: z.string(), category: z.string() }),
      ),
    }),
  ),
  total: z.number().int(),
});

export const findChurchesTool = {
  name: 'find_churches',
  title: 'Find churches',
  description:
    'Find churches near a location, nearest first, optionally filtered by ' +
    'tags such as denomination, confession or worship style ' +
    '(see list_church_tags). Pass the latitude/longitude of the place.',
  inputSchema: findChurchesInput,
  outputSchema: findChurchesOutput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
} as const;
// Wrapper note: there's no server-side geocoder in the web process (the
// Mapbox geocoding token lives with the Temporal worker, and it's a paid call),
// so agents supply coordinates — LLMs know city coordinates well enough for a
// 25-mile radius.

// ---------------------------------------------------------------------------
// list_church_tags  — church.getOrganizationTags
// ---------------------------------------------------------------------------

export const listChurchTagsInput = z.object({});

export const listChurchTagsOutput = z.object({
  tags: z.array(
    z.object({ slug: z.string(), label: z.string(), category: z.string() }),
  ),
});

export const listChurchTagsTool = {
  name: 'list_church_tags',
  title: 'List church tags',
  description:
    'All tags churches can be filtered by in find_churches, grouped by ' +
    'category (denomination, doctrine, eschatology, worship, confession, ' +
    'government, other).',
  inputSchema: listChurchTagsInput,
  outputSchema: listChurchTagsOutput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
} as const;
