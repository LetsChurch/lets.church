import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ChannelCard } from '@/components/channel-card';
import { ChannelFiltersModal } from '@/components/channel-filters-modal';
import { EmptyState } from '@/components/empty-state';
import MainLayout from '@/components/main-layout';
import { MediaGrid } from '@/components/media-grid';
import { useTRPC } from '@/trpc/react';
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '@/util/image-sizes';

const channelsSearchSchema = z.object({
  search: z.string().optional(),
  sort: z
    .enum(['name', 'subscribers', 'newest'])
    .optional()
    .default('subscribers'),
});

export const Route = createFileRoute('/_main/channels')({
  validateSearch: (search) => channelsSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({
    search: search.search,
    sort: search.sort,
  }),
  loader: async ({ context, deps }) => {
    await context.queryClient.prefetchInfiniteQuery(
      context.trpc.channel.listPublicChannels.infiniteQueryOptions({
        search: deps.search,
        sortBy: deps.sort,
        limit: 20,
      }),
    );

    return {
      searchQuery: deps.search,
    };
  },
  head: ({ loaderData }) => {
    const searchQuery = loaderData?.searchQuery;

    const title = searchQuery
      ? `Search Channels: ${searchQuery} - Let's Church`
      : "Browse Channels - Let's Church";
    const description = searchQuery
      ? `Search results for "${searchQuery}" in channels on Let's Church. Discover churches and creators sharing sermons, teachings, and more.`
      : "Discover churches and creators sharing sermons, teachings, and Christian content on Let's Church. Browse channels by name or popularity.";
    const url =
      typeof window !== 'undefined'
        ? window.location.href
        : searchQuery
          ? `https://lets.church/channels?search=${encodeURIComponent(searchQuery)}`
          : 'https://lets.church/channels';

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
          content: 'https://lets.church/og-image.png',
        },
        {
          property: 'og:image:width',
          content: OG_IMAGE_WIDTH.toString(),
        },
        {
          property: 'og:image:height',
          content: OG_IMAGE_HEIGHT.toString(),
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
          content: 'https://lets.church/og-image.png',
        },
      ],
      links: [
        {
          rel: 'canonical',
          href: searchQuery
            ? `https://lets.church/channels?search=${encodeURIComponent(searchQuery)}`
            : 'https://lets.church/channels',
        },
      ],
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { search: searchParam, sort } = Route.useSearch();
  const navigate = useNavigate({ from: '/channels' });
  const trpc = useTRPC();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const {
    data: channelsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...trpc.channel.listPublicChannels.infiniteQueryOptions({
      search: searchParam,
      sortBy: sort,
      limit: 20,
    }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? null,
    initialPageParam: null as number | null,
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
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

  const channels =
    channelsData?.pages.flatMap((page) => page?.items ?? []) ?? [];

  const handleSortChange = (newSort: 'name' | 'subscribers' | 'newest') => {
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, sort: newSort }),
    });
  };

  return (
    <MainLayout containerClassName="mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="font-bold text-4xl text-primary">Browse Channels</h1>
          <p className="text-lg text-secondary">
            Discover churches and creators sharing sermons, teachings, and more.
          </p>
        </div>

        <div className="relative">
          <input
            type="search"
            defaultValue={searchParam ?? ''}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const value = e.currentTarget.value;
                navigate({
                  search: {
                    search: value || undefined,
                    sort,
                  },
                  replace: true,
                });
              }
            }}
            placeholder="Search channels..."
            className="w-full rounded-3xl border border-gray-950/15 bg-gray-950/10 py-2.5 pr-12 pl-4 text-primary text-sm shadow-sm backdrop-blur-md transition-all placeholder:text-gray-950/30 hover:border-gray-950/25 hover:bg-gray-950/15 focus:border-white/0 focus:bg-gray-950/20 focus:shadow-[0_0_0_2px_--theme(--color-white/0.2),0_0_20px_--theme(--color-white/0.3)] focus:outline-none dark:border-white/15 dark:bg-white/10 dark:focus:bg-white/20 dark:hover:border-white/25 dark:hover:bg-white/15 dark:placeholder:text-white/30"
          />
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="-translate-y-1/2 absolute top-1/2 right-2 flex size-8 items-center justify-center rounded-full text-primary opacity-50 transition-colors hover:bg-white/10 hover:text-primary"
            aria-label="Filters"
          >
            <IconAdjustmentsHorizontal size={24} />
          </button>
        </div>

        <ChannelFiltersModal
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          sort={sort}
          onSortChange={handleSortChange}
        />

        {channels.length > 0 ? (
          <>
            <MediaGrid>
              {channels.map((channel) => (
                <ChannelCard
                  key={channel.id}
                  channelSlug={channel.slug}
                  name={channel.name}
                  description={channel.description}
                  avatarUrl={channel.avatarUrl}
                  subscriberCount={channel.subscriberCount}
                />
              ))}
            </MediaGrid>

            <div ref={loadMoreRef} className="h-20" />

            {isFetchingNextPage ? (
              <div className="flex justify-center py-8">
                <div className="text-sm text-zinc-400">
                  Loading more channels...
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            emptyTitle={
              searchParam ? 'No channels found' : 'No channels available'
            }
            emptyBody={
              searchParam
                ? 'Try a different search term'
                : 'Check back later for new channels'
            }
            variant="error"
          />
        )}
      </div>
    </MainLayout>
  );
}
