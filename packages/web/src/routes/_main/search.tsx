import { Collapsible } from '@base-ui-components/react/collapsible';
import { IconX } from '@tabler/icons-react';
import { useInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
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
import { RelatedSearches } from '@/components/related-searches';
import SearchBar from '@/components/search-bar';
import { MobileFacets, SearchFacets } from '@/components/search-facets';
import { SearchRow } from '@/components/search-row';
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
  validateSearch: z.object({
    q: z.string().optional(),
    channelSlugs: z.array(z.string()).optional(),
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
    sort: search.sort,
    dateRange: search.dateRange,
    dateStart: search.dateStart,
    dateEnd: search.dateEnd,
    skipLogging: search.skipLogging,
  }),
  loader: async ({ context, deps }) => {
    if (deps.q) {
      // Hybrid (BM25 + vector RRF) results over lc_media_v1. Slug→ID conversion,
      // the query embedding, and the structured query parse (speaker notice +
      // answer-panel decision, returned on page 0) all happen in the procedure.
      const searchData = await context.queryClient.fetchInfiniteQuery(
        context.trpc.search.hybridSearch.infiniteQueryOptions({
          q: deps.q,
          channelSlugs: deps.channelSlugs,
          limit: 20,
          sort: deps.sort,
          dateRange: deps.dateRange,
          dateGte: deps.dateStart,
          dateLte: deps.dateEnd,
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
  const { q } = Route.useSearch();

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
const emptyStrings: ReadonlyArray<string> = [];
const emptyMatchedChannels: ReadonlyArray<{ slug: string; name: string }> = [];

function SearchResults({ q }: { q: string }) {
  const { channelSlugs, sort, dateRange, dateStart, dateEnd, skipLogging } =
    Route.useSearch();
  const trpc = useTRPC();
  const navigate = useNavigate({ from: Route.fullPath });
  const loadMoreRef = useRef<HTMLDivElement>(null);
  // Tracks the query we've already applied parser pre-fills for, so clearing a
  // pre-filled filter doesn't immediately re-apply it (only a new query does).
  const prefilledQueryRef = useRef<string | null>(null);

  const {
    data: searchData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...trpc.search.hybridSearch.infiniteQueryOptions({
      q,
      channelSlugs,
      limit: 20,
      sort,
      dateRange,
      dateGte: dateStart,
      dateLte: dateEnd,
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

  // Query parse + search-log id come back on page 0 of the hybrid search.
  const parsed = searchData?.pages?.[0]?.parsed ?? null;
  const searchLogId = searchData?.pages?.[0]?.searchLogId ?? null;
  const facetedChannels = searchData?.pages?.[0]?.facetedChannels ?? [];
  const relatedSearches =
    searchData?.pages?.[0]?.relatedSearches ?? emptyStrings;

  // Best-effort filter pre-fill from the parser: when it pulls a channel name
  // or a date range out of the query and the user hasn't set the corresponding
  // filter, apply it (scoping results and checking the facet). Done once per
  // query — gated on `parsed` (i.e. page 0 has loaded) and tracked via the ref
  // so clearing a pre-filled value doesn't re-apply it; only a new query does.
  const matchedChannels = parsed?.matchedChannels ?? emptyMatchedChannels;
  const parsedDates = parsed?.dates ?? null;
  useEffect(() => {
    if (prefilledQueryRef.current === q) return;
    if (!parsed) return; // wait for page 0 before deciding
    prefilledQueryRef.current = q;

    const patch: Record<string, unknown> = {};
    if (matchedChannels.length > 0 && !channelSlugs?.length) {
      patch.channelSlugs = matchedChannels.map((c) => c.slug);
    }
    const hasDateFilter =
      (dateRange && dateRange !== 'all-time') || dateStart || dateEnd;
    if (parsedDates && (parsedDates.gte || parsedDates.lte) && !hasDateFilter) {
      patch.dateRange = undefined;
      patch.dateStart = parsedDates.gte ?? undefined;
      patch.dateEnd = parsedDates.lte ?? undefined;
    }
    if (Object.keys(patch).length > 0) {
      navigate({
        to: '/search',
        search: (prev) => ({ ...prev, ...patch }),
        replace: true,
      });
    }
  }, [
    q,
    parsed,
    matchedChannels,
    parsedDates,
    channelSlugs,
    dateRange,
    dateStart,
    dateEnd,
    navigate,
  ]);

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

  if (!q) {
    return <NoSearch />;
  }

  return (
    // One preview delay-group across the answer + results: the first hover waits,
    // then moving between any reference/result preview is instant.
    <MediaPreviewGroup>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-8">
          {/* Facets live in the sidebar on desktop; on mobile they collapse
              into a drawer behind this button. */}
          <div className="lg:hidden">
            <MobileFacets availableChannels={facetedChannels} />
          </div>

          {parsed?.speakerNotice ? (
            <div className="rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-amber-200/90 text-sm">
              Filtering by speaker (e.g.{' '}
              {parsed.speakers.slice(0, 3).join(', ')}) isn't available yet —
              searching those names across titles and transcripts instead.
            </div>
          ) : null}

          {parsed && parsed.questions.length > 0 ? (
            <AnswerPanel
              q={q}
              question={parsed.questions[0]}
              searchLogId={searchLogId}
            />
          ) : null}

          {mediaCount > 0 ? (
            <p className="text-muted text-sm">
              {mediaCount.toLocaleString()}{' '}
              {mediaCount === 1 ? 'result' : 'results'}
            </p>
          ) : null}

          {channels.length > 0 ? (
            <div className="space-y-4">
              <h2 className="font-medium text-primary">Channels</h2>
              <AvatarCarousel items={channels} />
            </div>
          ) : null}

          {items.length > 0 ? (
            <div className="space-y-4">
              {items.map((item) => (
                <Result key={item.id} item={item} />
              ))}
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

          {/* Related searches — shown in the sidebar on desktop; here at the
              end of the results on mobile (the sidebar is hidden there). */}
          <div className="lg:hidden">
            <RelatedSearches searches={relatedSearches} />
          </div>
        </div>

        <aside className="hidden space-y-8 lg:sticky lg:top-4 lg:block lg:pb-8">
          <SearchFacets availableChannels={facetedChannels} />
          <RelatedSearches searches={relatedSearches} />
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
      className="relative z-10 flex cursor-pointer flex-row gap-1.5 rounded-md bg-white/5 p-3 text-primary transition-colors hover:bg-white/10"
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
      <div className="pt-1 text-[10px] tabular-nums leading-[1.4] tracking-[-0.2px]">
        {formatTime(segment.start)}
      </div>
      <div
        className="[&_mark]:-my-0.5 [&_mark]:-mx-1 text-primary/80 text-sm [&_mark]:rounded-sm [&_mark]:bg-orange-400/40 [&_mark]:px-1 [&_mark]:py-0.5 [&_mark]:text-primary"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped ElasticSearch output
        dangerouslySetInnerHTML={{ __html: segment.text }}
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
                    <SegmentPreview
                      // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                      key={index}
                      item={item}
                      segment={segment}
                    />
                  ))}
                </Collapsible.Panel>
                <Collapsible.Trigger className="relative z-10 mt-2 w-full px-1 py-0.5 text-center text-muted text-xs transition-colors hover:text-primary">
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
