import { IconX } from '@tabler/icons-react';
import { useInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useRef } from 'react';
import { AvatarCarousel } from '@/components/avatar-carousel';
import Header from '@/components/header';
import { MediaCompactCard } from '@/components/media-compact-card';
import Search from '@/components/search-bar';
import SearchTabs from '@/components/search-tabs';
import { TrendingSearchPill } from '@/components/trending-search-pill';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import {
  useDeleteRecentSearch,
  useRecentSearches,
} from '@/hooks/use-recent-searches';
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
  validateSearch: (search: Record<string, unknown>) => ({
    q: search.q as string | undefined,
    focus: (search.focus as 'media' | 'transcripts' | undefined) ?? 'media',
    channelId: search.channelId as string | undefined,
  }),
  loaderDeps: ({ search }) => ({
    q: search.q,
    focus: search.focus ?? 'media',
    channelId: search.channelId,
  }),
  loader: async ({ context, deps }) => {
    if (deps.q) {
      // Prefetch search results
      await context.queryClient.prefetchInfiniteQuery(
        context.trpc.search.performSearch.infiniteQueryOptions({
          q: deps.q,
          focus: deps.focus as 'media' | 'transcripts',
          channelIds: deps.channelId ? [deps.channelId] : undefined,
          limit: 20,
        }),
      );
    } else {
      // Prefetch trending uploads for empty search
      await context.queryClient.ensureQueryData(
        context.trpc.home.getTrendingUploads.queryOptions({ limit: 8 }),
      );
    }
  },
});

function RouteComponent() {
  const { q } = Route.useSearch();

  return (
    <div className="min-h-screen bg-page">
      <Header defaultSearchValue={q} />

      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="mb-6 sm:hidden">
          <Search placeholder="Search or ask anything..." defaultValue={q} />
        </div>

        {q ? <SearchResults q={q} /> : <EmptySearch />}
      </div>
    </div>
  );
}

const trendingSearches = [
  'What is sanctification?',
  'Christian political theory',
  'Polemics',
  'Christian disagreement on parenting',
];

function SearchResults({ q }: { q: string }) {
  const { focus, channelId } = Route.useSearch();
  const trpc = useTRPC();
  const navigate = useNavigate({ from: Route.fullPath });
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const {
    data: searchData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...trpc.search.performSearch.infiniteQueryOptions({
      q,
      focus: focus ?? 'media',
      channelIds: channelId ? [channelId] : undefined,
      limit: 20,
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
  const mediaCount =
    firstPage && typeof firstPage === 'object' && 'mediaCount' in firstPage
      ? (firstPage.mediaCount as number)
      : 0;
  const transcriptCount =
    firstPage && typeof firstPage === 'object' && 'transcriptCount' in firstPage
      ? (firstPage.transcriptCount as number)
      : 0;
  const channels =
    firstPage && typeof firstPage === 'object' && 'channels' in firstPage
      ? (firstPage.channels as Array<{
          id: string;
          name: string;
          slug: string;
          avatarUrl: string | null;
        }>)
      : [];

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

  // Show empty search if no results
  if (items.length === 0 && !isFetchingNextPage) {
    return <EmptySearch />;
  }

  return (
    <div className="space-y-8">
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

      <div className="space-y-4">
        {items.map((item) => {
          // Handle transcript results with segments
          if (
            focus === 'transcripts' &&
            item.segments &&
            item.segments.length > 0
          ) {
            const firstSegment = item.segments[0];
            return (
              <Link
                key={item.id}
                to="/media/$mediaId"
                params={{ mediaId: item.id }}
                search={{ t: Math.floor(firstSegment.start / 1000) }}
                className="block"
              >
                <MediaCompactCard
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
                    item.lengthSeconds
                      ? formatTime(item.lengthSeconds * 1000)
                      : undefined
                  }
                />
                <div className="mt-2 rounded-md bg-white/5 p-3">
                  <div className="font-mono text-muted text-xs">
                    {formatTime(firstSegment.start)}
                  </div>
                  <div
                    className="text-primary/80 text-sm"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped ElasticSearch output
                    dangerouslySetInnerHTML={{ __html: firstSegment.text }}
                  />
                </div>
              </Link>
            );
          }

          // Handle regular media results
          return (
            <Link
              key={item.id}
              to="/media/$mediaId"
              params={{ mediaId: item.id }}
              className="block"
            >
              <MediaCompactCard
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
                  item.lengthSeconds
                    ? formatTime(item.lengthSeconds * 1000)
                    : undefined
                }
              />
            </Link>
          );
        })}
      </div>

      {/* Infinite scroll trigger */}
      <div ref={loadMoreRef} className="h-20" />

      {/* Loading indicator */}
      {isFetchingNextPage ? (
        <div className="flex justify-center py-8">
          <div className="text-sm text-zinc-400">Loading more...</div>
        </div>
      ) : null}

      <div className="space-y-4">
        <h2 className="font-medium text-primary">Related Searches</h2>
        <div className="flex flex-wrap gap-2">
          {trendingSearches.map((search) => (
            <TrendingSearchPill key={search} search={search} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptySearch() {
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
      search: { q: query, focus: 'media' as const, channelId: undefined },
    });
  };

  return (
    <>
      {/* Trending Searches */}
      <div className="border-white/10 border-b pb-6">
        <h2 className="mb-4 font-medium text-lg text-primary">
          Trending Searches
        </h2>
        <div className="flex flex-wrap gap-2">
          {trendingSearches.map((search) => (
            <TrendingSearchPill key={search} search={search} />
          ))}
        </div>
      </div>

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
                  className="flex-1 text-left text-primary transition-colors hover:text-white"
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
          <button
            type="button"
            className="text-muted text-sm transition-colors hover:text-primary"
          >
            Show All
          </button>
        </div>
        <div className="space-y-4">
          {trendingUploads.map((upload) => (
            <MediaCompactCard
              key={upload.id}
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
