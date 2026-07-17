import { Collapsible } from '@base-ui/react/collapsible';
import { IconX } from '@tabler/icons-react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import posthog from 'posthog-js';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { AnswerPanel } from '@/components/answer-panel';
import { AvatarCarousel } from '@/components/avatar-carousel';
import { EmptyState } from '@/components/empty-state';
import MainLayout from '@/components/main-layout';
import {
  MediaPreviewGroup,
  MediaPreviewScope,
  MediaPreviewTarget,
} from '@/components/media-preview-link';
import SearchBar from '@/components/search-bar';
import {
  type DateSuggestion,
  MobileFacets,
  SearchFacets,
} from '@/components/search-facets';
import { SearchRow } from '@/components/search-row';
import { SuggestedSearches } from '@/components/suggested-searches';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import {
  useDeleteRecentSearch,
  useRecentSearches,
} from '@/hooks/use-recent-searches';
import { useTRPC } from '@/trpc/react';
import { bibleBookName, formatVerseRef } from '@/util/bible-url';
import { formatTime } from '@/util/format';
import { joinAdjacentMarks } from '@/util/highlight';

type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

type SearchResultItem = {
  id: string;
  title: string | null;
  description: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  lengthSeconds: number | null;
  thumbnailUrl: string | null;
  channel: {
    id: string;
    name: string;
    slug: string;
    avatarPath: string | null;
    defaultThumbnailPath: string | null;
    avatarUrl: string | null;
  };
  _count: {
    uploadViews: number;
  };
  segments?: TranscriptSegment[];
};

export const Route = createFileRoute('/_main/search')({
  component: RouteComponent,
  validateSearch: z.object({
    q: z.string().optional(),
    channelSlugs: z.array(z.string()).optional(),
    // OSIS verse facet tokens ("John.3.16"). OR semantics across the list.
    bibleRefs: z.array(z.string()).optional(),
    // OSIS book ids ("Rom") from the Bible-book facet. OR semantics.
    bibleBooks: z.array(z.string()).optional(),
    // Resolved speaker names from the speaker facet. OR semantics.
    speakers: z.array(z.string()).optional(),
    sort: z.enum(['relevance', 'date-asc', 'date-desc']).optional(),
    dateRange: z
      .enum(['all-time', 'today', 'this-week', 'this-month', 'this-year'])
      .optional(),
    // Custom inclusive publish-date bounds (YYYY-MM-DD); when set they take
    // precedence over the dateRange bucket.
    dateStart: z.string().optional(),
    dateEnd: z.string().optional(),
    skipLogging: z.boolean().optional(),
  }),
  loaderDeps: ({ search }) => ({
    q: search.q,
    channelSlugs: search.channelSlugs,
    bibleRefs: search.bibleRefs,
    bibleBooks: search.bibleBooks,
    speakers: search.speakers,
    sort: search.sort,
    dateRange: search.dateRange,
    dateStart: search.dateStart,
    dateEnd: search.dateEnd,
    skipLogging: search.skipLogging,
  }),
  loader: async ({ context, deps }) => {
    // Run the search when there's a query OR any facet (a facet-only browse,
    // e.g. a `?bibleRefs=[...]` link with no `q`, still returns results).
    const hasFacets =
      (deps.channelSlugs?.length ?? 0) > 0 ||
      (deps.bibleRefs?.length ?? 0) > 0 ||
      (deps.bibleBooks?.length ?? 0) > 0 ||
      (deps.speakers?.length ?? 0) > 0 ||
      (deps.dateRange != null && deps.dateRange !== 'all-time') ||
      deps.dateStart != null ||
      deps.dateEnd != null;
    if (deps.q || hasFacets) {
      const searchOptions =
        context.trpc.search.hybridSearch.infiniteQueryOptions({
          q: deps.q ?? '',
          channelSlugs: deps.channelSlugs,
          bibleRefs: deps.bibleRefs,
          bibleBooks: deps.bibleBooks,
          speakers: deps.speakers,
          limit: 20,
          sort: deps.sort,
          dateRange: deps.dateRange,
          dateGte: deps.dateStart,
          dateLte: deps.dateEnd,
          skipLogging: deps.skipLogging,
        });

      // On the server (initial load / crawlers) await results so the HTML and
      // the OG `<meta>` image (first result's thumbnail) are complete. On client
      // navigation, DON'T block — kick the query off and let the route render a
      // skeleton immediately (SearchResults' query drives the loading state), so
      // clicking a related-search pill transitions instantly instead of freezing
      // on the old page.
      if (typeof window === 'undefined') {
        const searchData =
          await context.queryClient.fetchInfiniteQuery(searchOptions);
        const firstItem = searchData?.pages?.[0]?.items?.[0] as
          | SearchResultItem
          | undefined;
        const firstResultThumbnailUrl = firstItem?.id
          ? await context.queryClient.fetchQuery(
              context.trpc.search.getUploadThumbnail.queryOptions({
                uploadId: firstItem.id,
              }),
            )
          : null;
        return { query: deps.q, firstResultThumbnailUrl };
      }

      void context.queryClient.prefetchInfiniteQuery(searchOptions);
      return { query: deps.q, firstResultThumbnailUrl: null };
    }

    // Prefetch trending uploads for empty search
    await context.queryClient.ensureQueryData(
      context.trpc.home.getTrendingUploads.queryOptions({ limit: 8 }),
    );

    return {
      query: undefined,
      firstResultThumbnailUrl: null,
    };
  },
  head: ({ loaderData }) => {
    const query = loaderData?.query;

    const title = query
      ? `Search: ${query} - Let's Church`
      : "Search - Let's Church";
    const description = query
      ? `Search results for "${query}" on Let's Church. Discover sermons, Bible studies, and Christian content.`
      : "Search Let's Church for sermons, Bible studies, worship services, and Christian content from churches around the world.";

    const url =
      typeof window !== 'undefined'
        ? window.location.href
        : query
          ? `https://lets.church/search?q=${encodeURIComponent(query)}`
          : 'https://lets.church/search';

    const fallbackImageUrl =
      loaderData?.firstResultThumbnailUrl || 'https://lets.church/og-image.png';

    return {
      meta: [
        // Basic meta tags
        {
          title,
        },
        {
          name: 'description',
          content: description,
        },
        // OpenGraph tags
        {
          property: 'og:url',
          content: url,
        },
        {
          property: 'og:type',
          content: 'website',
        },
        {
          property: 'og:title',
          content: title,
        },
        {
          property: 'og:description',
          content: description,
        },
        {
          property: 'og:image',
          content: fallbackImageUrl,
        },
        {
          property: 'og:image:width',
          content: '1280',
        },
        {
          property: 'og:image:height',
          content: '720',
        },
        {
          property: 'og:site_name',
          content: "Let's Church",
        },
        // Twitter Card tags
        {
          name: 'twitter:card',
          content: 'summary_large_image',
        },
        {
          property: 'twitter:domain',
          content: 'lets.church',
        },
        {
          property: 'twitter:url',
          content: url,
        },
        {
          name: 'twitter:title',
          content: title,
        },
        {
          name: 'twitter:description',
          content: description,
        },
        {
          name: 'twitter:image',
          content: fallbackImageUrl,
        },
      ],
      links: [
        {
          rel: 'canonical',
          href: query
            ? `https://lets.church/search?q=${encodeURIComponent(query)}`
            : 'https://lets.church/search',
        },
      ],
    };
  },
});

function RouteComponent() {
  const search = Route.useSearch();
  const { q } = search;
  // A facet-only browse (e.g. a `?bibleRefs=[...]` link with no free text) shows
  // results too, not the empty/trending state.
  const hasFacets =
    (search.channelSlugs?.length ?? 0) > 0 ||
    (search.bibleRefs?.length ?? 0) > 0 ||
    (search.bibleBooks?.length ?? 0) > 0 ||
    (search.speakers?.length ?? 0) > 0 ||
    (search.dateRange != null && search.dateRange !== 'all-time') ||
    search.dateStart != null ||
    search.dateEnd != null;

  return (
    <MainLayout
      defaultSearchValue={q}
      containerClassName="mx-auto max-w-7xl px-4 py-4"
      headerChildren={
        <div className="mb-6 px-4 sm:hidden">
          <SearchBar defaultValue={q} />
        </div>
      }
    >
      {q || hasFacets ? <SearchResults q={q ?? ''} /> : <NoSearch />}
    </MainLayout>
  );
}

const _trendingSearches = [
  'What is sanctification?',
  'Christian political theory',
  'Polemics',
  'Christian disagreement on parenting',
];

// When the instant (BM25-only) list returns at most this many results for a
// free-text query, treat it as empty/sparse and fire the semantic fallback
// (`deep: true`). Verbose natural-language queries whose content words are a
// minority of their tokens can't clear the retriever's term-overlap floor and
// land here; the deep pass embeds the query and surfaces matches by meaning.
const DEEP_FALLBACK_MAX_RESULTS = 2;

const emptyArray: ReadonlyArray<unknown> = [];
const emptyStrings: ReadonlyArray<string> = [];
const emptyMatchedChannels: ReadonlyArray<{ slug: string; name: string }> = [];
const emptyVerses: ReadonlyArray<{
  ref: string;
  label: string;
  count: number;
}> = [];
const emptyYears: ReadonlyArray<{ year: string; count: number }> = [];
const emptySpeakers: ReadonlyArray<{ name: string; count: number }> = [];

// Placeholder result rows shown while the first page of results loads, so a
// fresh search transitions instantly instead of freezing on the old page.
function SearchResultsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 rounded-lg p-2">
          <div className="h-[90px] w-40 shrink-0 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
          <div className="min-w-0 flex-1 space-y-2 py-1">
            <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-12 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Shown while the semantic-fallback pass is in flight: the instant lexical list
// came back empty/sparse, so we're pulling in related results by meaning. Purely
// a loading affordance — it's replaced by the deep results (or the empty state)
// the moment the fallback resolves. Wording deliberately avoids "search by
// meaning" so it doesn't read as the answer panel's manual "Dig deeper — search
// by meaning" button (a different surface: that re-runs the AI answer agent).
function FindingRelated() {
  return (
    <div className="text-muted flex items-center gap-3 rounded-lg border border-white/10 px-4 py-3 text-sm">
      <svg
        className="size-4 shrink-0 animate-spin text-orange-400"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4z"
        />
      </svg>
      <span>Few keyword matches — finding related results…</span>
    </div>
  );
}

function SearchResults({ q }: { q: string }) {
  const {
    channelSlugs,
    bibleRefs,
    bibleBooks,
    speakers,
    sort,
    dateRange,
    dateStart,
    dateEnd,
    skipLogging,
  } = Route.useSearch();
  const trpc = useTRPC();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  // A facet-only browse (empty `q`, at least one filter) still shows results and
  // facets — but skips the query-only affordances (AI answer, related searches).
  const hasFacets =
    (channelSlugs?.length ?? 0) > 0 ||
    (bibleRefs?.length ?? 0) > 0 ||
    (bibleBooks?.length ?? 0) > 0 ||
    (speakers?.length ?? 0) > 0 ||
    (dateRange != null && dateRange !== 'all-time') ||
    dateStart != null ||
    dateEnd != null;

  // Query the AI overview + related-searches on. With free text it's the query
  // itself; for a facet-only browse we synthesize a human description of the
  // active facets (e.g. "Matthew 10:8", a speaker, a book) so the overview still
  // renders — grounded in the same facet-filtered media (the answer's retrieval
  // is scoped by `filters` below). Empty → no overview (e.g. a bare date facet).
  const answerQuery =
    q.trim().length > 0
      ? q
      : [
          ...(bibleRefs ?? []).map(formatVerseRef),
          ...(bibleBooks ?? []).map(bibleBookName),
          ...(speakers ?? []),
        ]
          .join(', ')
          .trim();

  const getNextPageParam = (lastPage: unknown) => {
    if (lastPage && typeof lastPage === 'object' && 'nextCursor' in lastPage) {
      return (lastPage as { nextCursor: number | null }).nextCursor;
    }
    return null;
  };

  // ── Fast pass: the instant, BM25-only list (no query embed, no kNN). ────────
  const {
    data: fastData,
    fetchNextPage: fastFetchNextPage,
    hasNextPage: fastHasNextPage,
    isFetchingNextPage: fastIsFetchingNextPage,
    isPending,
    isPlaceholderData,
  } = useInfiniteQuery({
    ...trpc.search.hybridSearch.infiniteQueryOptions({
      q,
      channelSlugs,
      bibleRefs,
      bibleBooks,
      speakers,
      limit: 20,
      sort,
      dateRange,
      dateGte: dateStart,
      dateLte: dateEnd,
      skipLogging,
    }),
    getNextPageParam,
    initialPageParam: 0,
    // Changing a filter (channel, date, sort) re-keys this query. Keep the
    // previous results + facets on screen while the new ones load instead of
    // wiping to a skeleton — selecting a channel shouldn't blank the facet list
    // (which is filter-independent anyway). A genuinely new query still
    // skeletons, gated below.
    placeholderData: keepPreviousData,
  });

  const fastFirstPage = fastData?.pages?.[0];
  const fastMediaCount = fastFirstPage?.mediaCount ?? 0;
  // The fast pass has SETTLED for this exact query (not a kept-previous
  // placeholder from the last query/filter) — the gate for firing the fallback.
  const fastSettled = !isPlaceholderData && fastFirstPage != null;

  // ── Semantic fallback: only when the instant list came back empty/sparse for
  // a free-text query (facet-only browses have no text to embed). The deep pass
  // embeds the query and runs the full hybrid path, surfacing matches by meaning
  // that the BM25 term-overlap floor rejected. Enabled lazily so we never pay the
  // embed / kNN cold-graph tail on the hot path — only for the queries that need it.
  const wantDeep =
    q.trim().length > 0 &&
    fastSettled &&
    fastMediaCount <= DEEP_FALLBACK_MAX_RESULTS;

  const {
    data: deepData,
    fetchNextPage: deepFetchNextPage,
    hasNextPage: deepHasNextPage,
    isFetchingNextPage: deepIsFetchingNextPage,
    isPending: deepIsPending,
  } = useInfiniteQuery({
    ...trpc.search.hybridSearch.infiniteQueryOptions({
      q,
      channelSlugs,
      bibleRefs,
      bibleBooks,
      speakers,
      limit: 20,
      sort,
      dateRange,
      dateGte: dateStart,
      dateLte: dateEnd,
      skipLogging,
      deep: true,
    }),
    getNextPageParam,
    initialPageParam: 0,
    enabled: wantDeep,
    // No keepPreviousData: on a new query the deep cache must reset to undefined
    // (not show the prior query's deep hits) until this query's fallback resolves.
  });

  const deepFirstPage = deepData?.pages?.[0];
  // Deep results supersede the sparse lexical list once they're in with ≥1 hit.
  const showDeep =
    wantDeep && deepFirstPage != null && deepFirstPage.items.length > 0;
  // "Digging deeper": the fallback is wanted but its first page hasn't landed yet.
  const digging = wantDeep && deepIsPending;

  // The active result set + pagination controls: deep when it superseded the
  // sparse lexical list, else the fast lexical list.
  const searchData = showDeep ? deepData : fastData;
  const firstPage = showDeep ? deepFirstPage : fastFirstPage;
  const fetchNextPage = showDeep ? deepFetchNextPage : fastFetchNextPage;
  const hasNextPage = showDeep ? deepHasNextPage : fastHasNextPage;
  const isFetchingNextPage = showDeep
    ? deepIsFetchingNextPage
    : fastIsFetchingNextPage;

  // The search-log id ALWAYS comes from the fast pass — the deep pass re-runs the
  // same query and deliberately doesn't log (so no duplicate row), returning a
  // null id. The answer panel + searchMeta attach to this one row.
  const searchLogId = fastFirstPage?.searchLogId ?? null;
  const facetedChannels = firstPage?.facetedChannels ?? [];
  const facetedSpeakers = firstPage?.facetedSpeakers ?? emptySpeakers;
  const facetedVerses = firstPage?.facetedVerses ?? emptyVerses;
  const facetedYears = firstPage?.facetedYears ?? emptyYears;

  // Skeleton only while loading a *new query* — never on a filter change (where
  // `keepPreviousData` keeps the old results/facets up). `settledQRef` records
  // the query whose data is currently shown; if the displayed data is a
  // placeholder for a different query, we're loading a new search → skeleton.
  // (Using settled data, not a render-time `q` diff, avoids a flash on the
  // initial hydrated load where data is already present.)
  const settledQRef = useRef<string | null>(null);
  useEffect(() => {
    if (fastSettled) {
      settledQRef.current = q;
    }
  }, [fastSettled, q]);
  const loadingResults =
    isPending || (isPlaceholderData && settledQRef.current !== q);

  // Sidebar/answer metadata (the structured parse + related searches) is fetched
  // separately so it never blocks the results — they render the moment
  // retrieval returns. We gate it on page 0 being in so it fires exactly once
  // with the settled `searchLogId` (used to attach the parse to that log row),
  // avoiding a null→id re-key and the stale-parse flash that would feed the
  // answer panel a previous query's question.
  const { data: meta } = useQuery({
    ...trpc.search.searchMeta.queryOptions({
      q: answerQuery,
      searchLogId,
      // Ground the parser's channel suggestion in the channels that actually
      // matched (the facet set), so it only ever suggests a real, useful filter.
      facetChannels: facetedChannels.map((c) => ({
        slug: c.slug,
        name: c.name,
      })),
      // Ground the parser's speaker extraction in the speakers that actually
      // matched, so a parsed name only ever suggests a real, filterable facet.
      facetSpeakers: facetedSpeakers.map((s) => s.name),
    }),
    // Needs a query to parse/relate — the free-text one, or the synthesized
    // facet description for a facet-only browse. Skip only when neither exists.
    enabled: firstPage != null && answerQuery.length > 0,
    // Keep the previous parse/related on screen across FILTER changes (same q,
    // new log id) so the sidebar doesn't flash — but NOT across a new query, or
    // the previous query's parse/recommendations would leak into the new one.
    placeholderData: (prev, prevQuery) => {
      const prevQ = (
        prevQuery?.queryKey?.[1] as { input?: { q?: string } } | undefined
      )?.input?.q;
      return prevQ === answerQuery ? prev : undefined;
    },
  });
  // Meta is "loading" once retrieval is in (so it's enabled) but hasn't returned
  // yet — that's when the suggested-searches pills show their skeleton.
  const metaLoading = firstPage != null && meta === undefined;
  const parsed = meta?.parsed ?? null;
  const relatedSearches = meta?.relatedSearches ?? emptyStrings;
  // Recommendations are a property of the QUERY, not the current filters. The
  // meta query re-keys on every filter change (a new log id; date filters even
  // reshape the facet candidates), which can momentarily drop a recommendation —
  // so we capture the first non-empty set the parser returns for this query and
  // hold it, resetting only when the query itself changes. That way applying a
  // suggested filter and then clearing it brings its sparkle back.
  const recsRef = useRef<{
    q: string;
    channels: ReadonlyArray<{ slug: string; name: string }>;
    speakers: ReadonlyArray<string>;
    date: {
      dateRange: 'today' | 'this-week' | 'this-month' | 'this-year' | null;
      dates: { gte: string | null; lte: string | null } | null;
      dateLabel: string | null;
    } | null;
  }>({ q, channels: emptyMatchedChannels, speakers: emptyStrings, date: null });
  if (recsRef.current.q !== q) {
    recsRef.current = {
      q,
      channels: emptyMatchedChannels,
      speakers: emptyStrings,
      date: null,
    };
  }
  if (parsed) {
    if (
      recsRef.current.channels.length === 0 &&
      parsed.matchedChannels.length
    ) {
      recsRef.current.channels = parsed.matchedChannels;
    }
    if (
      recsRef.current.speakers.length === 0 &&
      parsed.matchedSpeakers.length
    ) {
      recsRef.current.speakers = parsed.matchedSpeakers;
    }
    const parsedHasDate =
      parsed.dateRange != null ||
      (parsed.dates != null &&
        (parsed.dates.gte != null || parsed.dates.lte != null));
    if (recsRef.current.date == null && parsedHasDate) {
      recsRef.current.date = {
        dateRange: parsed.dateRange,
        dates: parsed.dates,
        dateLabel: parsed.dateLabel,
      };
    }
  }
  const queryRecChannels = recsRef.current.channels;
  const queryRecDate = recsRef.current.date;

  // Suggestions are hidden while their corresponding filter is applied and
  // reappear when it's cleared (never auto-applied).
  const hasDateFilter = Boolean(
    (dateRange && dateRange !== 'all-time') || dateStart || dateEnd,
  );
  const suggestChannels = !channelSlugs?.length
    ? queryRecChannels
    : emptyMatchedChannels;
  const recommendedChannelSlugs = suggestChannels.map((c) => c.slug);
  // Speaker recommendation: parsed speaker names that resolved to a real,
  // filterable speaker. Suppressed once the user has picked any speaker.
  const recommendedSpeakers = !speakers?.length
    ? recsRef.current.speakers
    : emptyStrings;
  // The date recommendation: a current-period bucket (marks that Date facet
  // option), or an absolute range with an optional relative label ("Past
  // month", "Since 2020"). Suppressed once the user has set any date filter.
  const dateSuggestion: DateSuggestion | null =
    hasDateFilter || !queryRecDate
      ? null
      : queryRecDate.dateRange
        ? { kind: 'bucket', bucket: queryRecDate.dateRange }
        : queryRecDate.dates &&
            (queryRecDate.dates.gte || queryRecDate.dates.lte)
          ? {
              kind: 'range',
              gte: queryRecDate.dates.gte,
              lte: queryRecDate.dates.lte,
              label: queryRecDate.dateLabel ?? null,
            }
          : null;

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target?.isIntersecting) {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }
      },
      {
        root: null,
        rootMargin: '200px',
        threshold: 0,
      },
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const mediaCount = firstPage?.mediaCount ?? 0;
  const channels = firstPage
    ? firstPage.channels
    : (emptyArray as ReadonlyArray<{
        id: string;
        name: string;
        slug: string;
        avatarUrl?: string | null;
      }>);

  const items: SearchResultItem[] =
    searchData?.pages.flatMap((page) => {
      if (page && typeof page === 'object' && 'items' in page) {
        return page.items as SearchResultItem[];
      }
      return [];
    }) ?? [];

  if (!q && !hasFacets) {
    return <NoSearch />;
  }

  return (
    // One preview delay-group across the answer + results: the first hover waits,
    // then moving between any reference/result preview is instant.
    <MediaPreviewGroup>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-8">
          {/* Facets live in the sidebar on desktop; on mobile they collapse
              into a drawer behind this button — which also holds the AI filter
              suggestions and badges their count. */}
          <div className="lg:hidden">
            <MobileFacets
              availableChannels={facetedChannels}
              availableSpeakers={facetedSpeakers}
              availableVerses={facetedVerses}
              availableYears={facetedYears}
              channelsLoading={loadingResults}
              recommendedChannelSlugs={recommendedChannelSlugs}
              recommendedSpeakers={recommendedSpeakers}
              recommendedDate={dateSuggestion}
            />
          </div>

          {/* Always render the AI card so it streams in immediately rather than
              popping in once the parse resolves — the route returns a direct
              answer, an overview of the results, or a concise decline, so it's
              always meaningful. It shows "Seeking…" at once; `ready` holds the
              fetch until THIS query's page 0 has settled (not a kept-previous
              placeholder), so it answers — and logs to — the current query, not
              the last one. Keyed by q to stream fresh per query. */}
          {/* The AI card: a direct answer for a free-text query, or a grounded
              overview of the facet-matched media for a facet-only browse (the
              synthesized `answerQuery` describes the active facets; retrieval is
              scoped by `filters` below). Omitted only when neither exists. */}
          {answerQuery.length > 0 ? (
            <AnswerPanel
              key={answerQuery}
              q={answerQuery}
              searchLogId={searchLogId}
              // Facet-only browse (no free text): the query is synthesized from
              // the facet, so let the server produce an overview rather than
              // gating it off as an off-topic phrase.
              facetOnly={q.trim().length === 0}
              ready={firstPage != null && !loadingResults}
              // Scope the answer to whatever filters were pre-filled on the URL
              // (e.g. a channel slug when searching from a channel page).
              // Captured once when the query loads — changing a filter won't
              // regenerate it.
              filters={{
                channelSlugs,
                speakers,
                bibleRefs,
                bibleBooks,
                dateRange,
                dateStart,
                dateEnd,
              }}
            />
          ) : null}

          {/* Suppress the count while digging: the sparse lexical count (e.g.
              "1 result") is about to be replaced by the fuller deep count, and
              flashing the old number first reads as a glitch. */}
          {mediaCount > 0 && !digging ? (
            <p className="text-muted text-sm">
              {mediaCount.toLocaleString()}{' '}
              {mediaCount === 1 ? 'result' : 'results'}
            </p>
          ) : null}

          {channels.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-primary font-medium">Channels</h2>
              <AvatarCarousel items={channels} />
            </div>
          ) : null}

          {loadingResults ? (
            <SearchResultsSkeleton />
          ) : items.length > 0 ? (
            <div className="space-y-4">
              {items.map((item) => (
                <Result key={item.id} item={item} />
              ))}
              {/* Sparse lexical hits are visible above; the fallback is still
                  searching by meaning for more. */}
              {digging ? <FindingRelated /> : null}
            </div>
          ) : digging ? (
            // No lexical hits at all yet — the fallback is the only thing running.
            <FindingRelated />
          ) : (
            <EmptyState
              emptyTitle="There are no matches"
              emptyBody="Try rephrasing your query or removing filters"
              variant="error"
            />
          )}

          {/* Infinite scroll trigger */}
          <div ref={loadMoreRef} className="h-20" />

          {/* Loading indicator */}
          {isFetchingNextPage ? (
            <div className="flex justify-center py-8">
              <div className="text-sm text-zinc-400">Loading more...</div>
            </div>
          ) : null}

          {/* Suggested searches — shown in the sidebar on desktop; here at the
              end of the results on mobile (the sidebar is hidden there). */}
          <div className="lg:hidden">
            <SuggestedSearches
              searches={relatedSearches}
              loading={metaLoading}
            />
          </div>
        </div>

        {/* Sticky, capped to the viewport and scrolling on its own, so a tall
            sidebar (facets + suggested searches) scrolls independently of the
            results column instead of clipping its lower content. */}
        <aside className="hidden space-y-8 lg:sticky lg:top-4 lg:block lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pb-8">
          <SearchFacets
            availableChannels={facetedChannels}
            availableSpeakers={facetedSpeakers}
            availableVerses={facetedVerses}
            availableYears={facetedYears}
            channelsLoading={loadingResults}
            recommendedChannelSlugs={recommendedChannelSlugs}
            recommendedSpeakers={recommendedSpeakers}
            recommendedDate={dateSuggestion}
          />
          <SuggestedSearches searches={relatedSearches} loading={metaLoading} />
        </aside>
      </div>
    </MediaPreviewGroup>
  );
}

// One transcript segment row, using the shared hover preview.
function SegmentPreview({
  item,
  segment,
}: {
  item: SearchResultItem;
  segment: TranscriptSegment;
}) {
  const startSeconds = segment.start / 1000;

  return (
    <MediaPreviewTarget
      mediaId={item.id}
      startSeconds={startSeconds}
      thumbnailUrl={item.thumbnailUrl}
      className="text-primary relative z-10 flex cursor-pointer flex-row gap-1.5 rounded-md bg-white/5 p-3 transition-colors hover:bg-white/10"
      onPreviewOpen={() =>
        posthog.capture('transcript_preview_opened', {
          upload_id: item.id,
          media_title: item.title,
          channel_id: item.channel.id,
          channel_name: item.channel.name,
          published_at: item.publishedAt?.toISOString() ?? null,
          length_seconds: item.lengthSeconds,
          segment_start_seconds: startSeconds,
        })
      }
      onActivate={(seconds, usedPreview) =>
        posthog.capture('transcript_result_clicked', {
          upload_id: item.id,
          media_title: item.title,
          channel_id: item.channel.id,
          channel_name: item.channel.name,
          published_at: item.publishedAt?.toISOString() ?? null,
          length_seconds: item.lengthSeconds,
          segment_start_seconds: startSeconds,
          navigate_to_seconds: seconds,
          used_mini_player: usedPreview,
        })
      }
    >
      <div className="pt-1 text-[10px] leading-[1.4] tracking-[-0.2px] tabular-nums">
        {formatTime(segment.start)}
      </div>
      <div
        className="text-primary/80 [&_mark]:text-primary text-sm [&_mark]:-mx-1 [&_mark]:-my-0.5 [&_mark]:rounded-sm [&_mark]:bg-orange-400/40 [&_mark]:px-1 [&_mark]:py-0.5"
        dangerouslySetInnerHTML={{ __html: joinAdjacentMarks(segment.text) }}
      />
    </MediaPreviewTarget>
  );
}

function Result({ item }: { item: SearchResultItem }) {
  const [showAll, setShowAll] = useState(false);

  const segments = item.segments ?? [];
  const [first, ...rest] = segments;

  return (
    <SearchRow
      id={item.id}
      title={item.title ?? 'Untitled'}
      thumbnailUrl={item.thumbnailUrl}
      channelName={item.channel.name}
      channelImageUrl={item.channel.avatarUrl}
      timestamp={
        item.publishedAt
          ? formatDistanceToNow(new Date(item.publishedAt), {
              addSuffix: true,
            })
          : undefined
      }
      duration={
        item.lengthSeconds ? formatTime(item.lengthSeconds * 1000) : undefined
      }
    >
      {first ? (
        // One preview card for the whole row — all segments are the same media,
        // so moving between them re-anchors + re-seeks the same player instantly.
        <MediaPreviewScope side="right" sideOffset={12}>
          <div className="mt-2 space-y-2">
            <SegmentPreview item={item} segment={first} />
            {rest.length > 0 ? (
              <Collapsible.Root open={showAll} onOpenChange={setShowAll}>
                <Collapsible.Panel className="space-y-2">
                  {rest.map((segment, index) => (
                    <SegmentPreview key={index} item={item} segment={segment} />
                  ))}
                </Collapsible.Panel>
                <Collapsible.Trigger className="text-muted hover:text-primary relative z-10 mt-2 w-full px-1 py-0.5 text-center text-xs transition-colors">
                  {showAll ? 'Show less' : `Show ${rest.length} more`}
                </Collapsible.Trigger>
              </Collapsible.Root>
            ) : null}
          </div>
        </MediaPreviewScope>
      ) : null}
    </SearchRow>
  );
}

function NoSearch() {
  const trpc = useTRPC();
  const isLoggedIn = useIsLoggedIn();
  const navigate = useNavigate({ from: Route.fullPath });

  const { data: trendingData } = useSuspenseQuery(
    trpc.home.getTrendingUploads.queryOptions({ limit: 8 }),
  );

  const trendingUploads = trendingData.items;

  const { data: recentSearches = [] } = useRecentSearches();
  const deleteSearchMutation = useDeleteRecentSearch();

  const removeRecentSearch = (query: string) => {
    deleteSearchMutation.mutate({ query });
  };

  const handleSearchClick = (query: string) => {
    navigate({
      search: { q: query, channelSlugs: undefined },
    });
  };

  return (
    <>
      {/* Trending Searches */}
      {/* TODO */}
      {/* <div className="border-white/10 border-b pb-6"> */}
      {/*   <h2 className="mb-4 font-medium text-lg text-primary"> */}
      {/*     Trending Searches */}
      {/*   </h2> */}
      {/*   <div className="flex flex-wrap gap-2"> */}
      {/*     {trendingSearches.map((search) => ( */}
      {/*       <TrendingSearchPill key={search} search={search} /> */}
      {/*     ))} */}
      {/*   </div> */}
      {/* </div> */}

      {/* Recent Searches */}
      {isLoggedIn && recentSearches.length > 0 ? (
        <div className="border-b border-white/10 py-6 sm:hidden">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-primary text-lg font-medium">
              Recent Searches
            </h2>
          </div>
          <div className="space-y-2">
            {recentSearches.map((search) => (
              <div
                key={search.searchedAt.getTime()}
                className="flex items-center justify-between py-1"
              >
                <button
                  type="button"
                  onClick={() => handleSearchClick(search.query)}
                  className="text-primary hover:text-primary flex-1 text-left transition-colors"
                >
                  {search.query}
                </button>
                <button
                  type="button"
                  onClick={() => removeRecentSearch(search.query)}
                  className="text-muted hover:text-primary flex size-7 items-center justify-center transition-colors"
                  aria-label={`Remove ${search.query}`}
                >
                  <IconX size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Trending */}
      <div className="pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-primary text-lg font-medium">Trending</h2>
        </div>
        <div className="space-y-4">
          {trendingUploads.map((upload) => (
            <SearchRow
              key={upload.id}
              id={upload.id}
              title={upload.title ?? 'Untitled'}
              thumbnailUrl={upload.thumbnailUrl}
              channelName={upload.channel.name}
              channelImageUrl={null}
              timestamp="Yesterday"
            />
          ))}
        </div>
      </div>
    </>
  );
}
