import { IconX } from '@tabler/icons-react';
import {
  useInfiniteQuery,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import posthog from 'posthog-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { AvatarCarousel } from '@/components/avatar-carousel';
import { EmptyState } from '@/components/empty-state';
import { FilterBar } from '@/components/filter-bar';
import MainLayout from '@/components/main-layout';
import { MiniPlayer } from '@/components/mini-player';
import SearchBar from '@/components/search-bar';
import { SearchRow } from '@/components/search-row';
import SearchTabs from '@/components/search-tabs';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import {
  useDeleteRecentSearch,
  useRecentSearches,
} from '@/hooks/use-recent-searches';
import { useSearchFilters } from '@/hooks/use-search-filters';
import { useTRPC } from '@/trpc/react';
import { formatTime } from '@/util/format';

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
    focus: z.enum(['media', 'transcripts']).optional().default('media'),
    channelSlugs: z.array(z.string()).optional(),
    sort: z.enum(['relevance', 'date-asc', 'date-desc']).optional(),
    dateRange: z
      .enum(['all-time', 'today', 'this-week', 'this-month', 'this-year'])
      .optional(),
    skipLogging: z.boolean().optional(),
  }),
  loaderDeps: ({ search }) => ({
    q: search.q,
    focus: search.focus,
    channelSlugs: search.channelSlugs,
    sort: search.sort,
    dateRange: search.dateRange,
    skipLogging: search.skipLogging,
  }),
  loader: async ({ context, deps }) => {
    if (deps.q) {
      // Fetch search results (slug-to-ID conversion happens in the procedure)
      const searchData = await context.queryClient.fetchInfiniteQuery(
        context.trpc.search.performSearch.infiniteQueryOptions({
          q: deps.q,
          focus: deps.focus as 'media' | 'transcripts',
          channelSlugs: deps.channelSlugs,
          limit: 20,
          sort: deps.sort,
          dateRange: deps.dateRange,
          skipLogging: deps.skipLogging,
        }),
      );

      // Get first search result ID and fetch thumbnail
      const firstItem = searchData?.pages?.[0]?.items?.[0] as
        | SearchResultItem
        | undefined;
      let firstResultThumbnailUrl = null;

      if (firstItem?.id) {
        firstResultThumbnailUrl = await context.queryClient.fetchQuery(
          context.trpc.search.getUploadThumbnail.queryOptions({
            uploadId: firstItem.id,
          }),
        );
      }

      return {
        query: deps.q,
        firstResultThumbnailUrl,
      };
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
  const { q, focus, channelSlugs, sort, dateRange, skipLogging } =
    Route.useSearch();
  const trpc = useTRPC();

  // Get faceted channels for filter options
  const { data: searchData } = useInfiniteQuery({
    ...trpc.search.performSearch.infiniteQueryOptions({
      q: q ?? '',
      focus,
      channelSlugs,
      limit: 20,
      sort,
      dateRange,
      skipLogging,
    }),
    enabled: Boolean(q),
    getNextPageParam: (lastPage) => {
      if (
        lastPage &&
        typeof lastPage === 'object' &&
        'nextCursor' in lastPage
      ) {
        return lastPage.nextCursor;
      }
      return null;
    },
    initialPageParam: 0,
  });

  const facetedChannels = searchData?.pages[0]?.facetedChannels ?? [];

  return (
    <MainLayout
      defaultSearchValue={q}
      containerClassName="mx-auto max-w-7xl px-4 py-4"
      availableChannels={facetedChannels}
      headerChildren={
        <div className="mb-6 px-4 sm:hidden">
          <SearchBar defaultValue={q} availableChannels={facetedChannels} />
        </div>
      }
    >
      {q ? <SearchResults q={q} /> : <NoSearch />}
    </MainLayout>
  );
}

const _trendingSearches = [
  'What is sanctification?',
  'Christian political theory',
  'Polemics',
  'Christian disagreement on parenting',
];

const emptyArray: ReadonlyArray<unknown> = [];

function SearchResults({ q }: { q: string }) {
  const { focus, channelSlugs, sort, dateRange, skipLogging } =
    Route.useSearch();
  const { hasActiveFilters } = useSearchFilters();
  const trpc = useTRPC();
  const navigate = useNavigate({ from: Route.fullPath });
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [activeHover, setActiveHover] = useState<{
    item: SearchResultItem;
    segmentIndex: number;
  } | null>(null);
  const [miniPlayerMousePos, setMiniPlayerMousePos] = useState({ x: 0, y: 0 });
  const hoverTimerRef = useRef<number | undefined>(undefined);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const activeHoverRef = useRef(activeHover);
  activeHoverRef.current = activeHover;
  const miniPlayerCurrentTimeRef = useRef<number>(0);

  const { data: miniPlayerSources } = useQuery({
    ...trpc.media.getMediaSources.queryOptions({
      mediaId: activeHover?.item.id ?? '',
    }),
    enabled: activeHover !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(
    () => () => {
      window.clearTimeout(hoverTimerRef.current);
      window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const handleSegmentMouseEnter = useCallback(
    (item: SearchResultItem, segmentIndex: number, e: React.MouseEvent) => {
      setMiniPlayerMousePos({ x: e.clientX, y: e.clientY });
      window.clearTimeout(closeTimerRef.current);

      const segmentStartSeconds =
        (item.segments?.[segmentIndex]?.start ?? 0) / 1000;

      if (activeHoverRef.current?.item.id === item.id) {
        // Same media — skip delay, scrub to new segment immediately
        window.clearTimeout(hoverTimerRef.current);
        miniPlayerCurrentTimeRef.current = segmentStartSeconds;
        setActiveHover({ item, segmentIndex });
      } else {
        // Different media — normal 500ms delay before opening
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = window.setTimeout(() => {
          miniPlayerCurrentTimeRef.current = segmentStartSeconds;
          setActiveHover({ item, segmentIndex });
          posthog.capture('transcript_preview_opened', {
            upload_id: item.id,
            media_title: item.title,
            channel_id: item.channel.id,
            channel_name: item.channel.name,
            published_at: item.publishedAt?.toISOString() ?? null,
            length_seconds: item.lengthSeconds,
            segment_start_seconds: segmentStartSeconds,
          });
        }, 500);
      }
    },
    [],
  );

  const handleSegmentMouseLeave = useCallback(() => {
    window.clearTimeout(hoverTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setActiveHover(null);
    }, 100);
  }, []);

  const handleSegmentMouseMove = useCallback((e: React.MouseEvent) => {
    setMiniPlayerMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const {
    data: searchData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...trpc.search.performSearch.infiniteQueryOptions({
      q,
      focus,
      channelSlugs,
      limit: 20,
      sort,
      dateRange,
      skipLogging,
    }),
    getNextPageParam: (lastPage) => {
      if (
        lastPage &&
        typeof lastPage === 'object' &&
        'nextCursor' in lastPage
      ) {
        return lastPage.nextCursor;
      }
      return null;
    },
    initialPageParam: 0,
  });

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

  const firstPage = searchData?.pages[0];
  const mediaCount = firstPage?.mediaCount ?? 0;
  const transcriptCount = firstPage?.transcriptCount ?? 0;
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

  const handleTabChange = (newFocus: 'media' | 'transcripts') => {
    navigate({
      search: (prev) => ({ ...prev, focus: newFocus }),
    });
  };

  if (!q) {
    return <NoSearch />;
  }

  return (
    <div className="space-y-8">
      {hasActiveFilters ? (
        <div className="space-y-4">
          <FilterBar />
        </div>
      ) : null}

      <SearchTabs
        activeTab={focus === 'transcripts' ? 'transcripts' : 'media'}
        mediaCount={mediaCount}
        transcriptCount={transcriptCount}
        onTabChange={handleTabChange}
      />

      {channels.length > 0 ? (
        <div className="space-y-4">
          <h2 className="font-medium text-primary">Channels</h2>
          <AvatarCarousel items={channels} />
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="space-y-4">
          {items.map((item) => {
            return (
              <Result
                key={item.id}
                item={item}
                focus={focus}
                onSegmentMouseEnter={handleSegmentMouseEnter}
                onSegmentMouseLeave={handleSegmentMouseLeave}
                onSegmentMouseMove={handleSegmentMouseMove}
                isActiveWithSources={
                  activeHover?.item.id === item.id && miniPlayerSources != null
                }
                miniPlayerCurrentTimeRef={miniPlayerCurrentTimeRef}
              />
            );
          })}
        </div>
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

      {/* Related searches */}
      {/* TODO */}
      {/* <div className="space-y-4"> */}
      {/*   <h2 className="font-medium text-primary">Related Searches</h2> */}
      {/*   <div className="flex flex-wrap gap-2"> */}
      {/*     {trendingSearches.map((search) => ( */}
      {/*       <TrendingSearchPill key={search} search={search} /> */}
      {/*     ))} */}
      {/*   </div> */}
      {/* </div> */}

      {activeHover && miniPlayerSources ? (
        <MiniPlayer
          mediaSource={miniPlayerSources.mediaSource}
          audioSource={miniPlayerSources.audioSource}
          thumbnailUrl={activeHover.item.thumbnailUrl}
          videoWidth={miniPlayerSources.videoWidth}
          videoHeight={miniPlayerSources.videoHeight}
          initialTimestamp={
            (activeHover.item.segments?.[activeHover.segmentIndex]?.start ??
              0) / 1000
          }
          mousePos={miniPlayerMousePos}
          currentTimeRef={miniPlayerCurrentTimeRef}
        />
      ) : null}
    </div>
  );
}

function Result({
  item,
  focus,
  onSegmentMouseEnter,
  onSegmentMouseLeave,
  onSegmentMouseMove,
  isActiveWithSources,
  miniPlayerCurrentTimeRef,
}: {
  item: SearchResultItem;
  focus: 'media' | 'transcripts' | undefined;
  onSegmentMouseEnter: (
    item: SearchResultItem,
    segmentIndex: number,
    e: React.MouseEvent,
  ) => void;
  onSegmentMouseLeave: () => void;
  onSegmentMouseMove: (e: React.MouseEvent) => void;
  isActiveWithSources: boolean;
  miniPlayerCurrentTimeRef: React.MutableRefObject<number>;
}) {
  const navigate = useNavigate();
  const [showAllSegments, setShowAllSegments] = useState(false);

  const segments = item.segments ?? [];
  const hasMultipleSegments = segments.length > 1;
  const displayedSegments = showAllSegments ? segments : segments.slice(0, 1);

  const handleSegmentClick = (
    e: React.MouseEvent,
    segment: TranscriptSegment,
  ) => {
    const segmentStartSeconds = segment.start / 1000;
    const navigateToSeconds = isActiveWithSources
      ? miniPlayerCurrentTimeRef.current
      : segmentStartSeconds;
    posthog.capture('transcript_result_clicked', {
      upload_id: item.id,
      media_title: item.title,
      channel_id: item.channel.id,
      channel_name: item.channel.name,
      published_at: item.publishedAt?.toISOString() ?? null,
      length_seconds: item.lengthSeconds,
      segment_start_seconds: segmentStartSeconds,
      navigate_to_seconds: navigateToSeconds,
      used_mini_player: isActiveWithSources,
    });
    if (isActiveWithSources) {
      e.preventDefault();
      navigate({
        to: '/media/$mediaId',
        params: { mediaId: item.id },
        hash: `t=${navigateToSeconds}`,
      });
    }
  };

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
      {focus === 'transcripts' && segments.length > 0 ? (
        <div className="mt-2 space-y-2">
          {displayedSegments.map((segment, index) => (
            <Link
              // biome-ignore lint/suspicious/noArrayIndexKey: index is stable here
              key={index}
              to="/media/$mediaId"
              params={{ mediaId: item.id }}
              hash={`t=${segment.start / 1000}`}
              className="relative z-10 flex cursor-pointer flex-row gap-1.5 rounded-md bg-white/5 p-3 text-primary transition-colors hover:bg-white/10"
              onMouseEnter={(e) => onSegmentMouseEnter(item, index, e)}
              onMouseLeave={onSegmentMouseLeave}
              onMouseMove={onSegmentMouseMove}
              onClick={(e) => handleSegmentClick(e, segment)}
            >
              <div className="pt-1 font-mono text-[10px] leading-[1.4] tracking-[-0.2px]">
                {formatTime(segment.start)}
              </div>
              <div
                className="[&_mark]:-my-0.5 [&_mark]:-mx-1 text-primary/80 text-sm [&_mark]:rounded-sm [&_mark]:bg-orange-400/40 [&_mark]:px-1 [&_mark]:py-0.5 [&_mark]:text-primary"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped ElasticSearch output
                dangerouslySetInnerHTML={{
                  __html: segment.text,
                }}
              />
            </Link>
          ))}
          {hasMultipleSegments ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowAllSegments((show) => !show);
              }}
              className="relative z-10 w-full px-1 py-0.5 text-center text-muted text-xs transition-colors hover:text-primary"
            >
              {showAllSegments
                ? 'Show less'
                : `Show ${segments.length - 1} more`}
            </button>
          ) : null}
        </div>
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
      search: { q: query, focus: 'media' as const, channelSlugs: undefined },
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
        <div className="border-white/10 border-b py-6 sm:hidden">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium text-lg text-primary">
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
                  className="flex-1 text-left text-primary transition-colors hover:text-primary"
                >
                  {search.query}
                </button>
                <button
                  type="button"
                  onClick={() => removeRecentSearch(search.query)}
                  className="flex size-7 items-center justify-center text-muted transition-colors hover:text-primary"
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
          <h2 className="font-medium text-lg text-primary">Trending</h2>
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
