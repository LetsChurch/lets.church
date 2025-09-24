import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { EmblaCarouselType } from 'embla-carousel';
import useEmblaCarousel from 'embla-carousel-react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { CarouselNavigationButtons } from '@/components/carousel-navigation-buttons';
import { CarouselPagination } from '@/components/carousel-pagination';
import { DonateCard } from '@/components/donate-card';
import { EmptyState } from '@/components/empty-state';
import Header from '@/components/header';
import { MediaCard } from '@/components/media-card';
import { SavedCard } from '@/components/saved-card';
import { SearchCard } from '@/components/search-card';
import { ViewMoreCard } from '@/components/view-more-card';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/')({
  component: Home,
  loader: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );

    await context.queryClient.ensureQueryData(
      context.trpc.home.getTrendingUploads.queryOptions({ limit: 20 }),
    );

    if (hasSession) {
      await context.queryClient.ensureQueryData(
        context.trpc.home.getSubscriptionUploads.queryOptions({ limit: 5 }),
      );
    }

    return {
      isLoggedIn: hasSession,
    };
  },
});

function ContentSection({
  title,
  uploads,
  showViewAll = true,
  showViewMoreCard = false,
  viewMoreCardText,
  emptyTitle,
  emptyBody,
  emptyCta,
}: {
  title: string;
  emptyTitle?: string;
  emptyBody?: string;
  emptyCta?: string;
  uploads: Array<{
    id: string;
    title?: string | null;
    thumbnailUrl?: string | null;
    channel: {
      name: string;
      avatarUrl?: string | null;
    };
  }>;
  showViewAll?: boolean;
  showViewMoreCard?: boolean;
  viewMoreCardText?: string;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: 'start',
    containScroll: 'trimSnaps',
    slidesToScroll: 1,
    breakpoints: {
      '(min-width: 768px)': { slidesToScroll: 2 },
      '(min-width: 1024px)': { slidesToScroll: 3 },
    },
  });

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const scrollTo = useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi],
  );

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);

  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    function onInit(emblaApi: EmblaCarouselType) {
      setScrollSnaps(emblaApi.scrollSnapList());
    }

    function onSelect(emblaApi: EmblaCarouselType) {
      setSelectedIndex(emblaApi.selectedScrollSnap());
      setCanScrollPrev(emblaApi.canScrollPrev());
      setCanScrollNext(emblaApi.canScrollNext());
    }

    onInit(emblaApi);
    onSelect(emblaApi);
    emblaApi.on('reInit', onInit);
    emblaApi.on('select', onSelect);

    return () => {
      emblaApi.off('reInit', onInit);
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  return (
    <div className="mb-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-medium text-lg text-primary">{title}</h2>
        {showViewAll && uploads.length > 0 && (
          <button
            type="button"
            className="text-muted text-sm transition-colors hover:text-primary"
          >
            View history
          </button>
        )}
      </div>

      {uploads.length > 0 ? (
        <>
          <div className="relative">
            <div
              className="-mx-16 relative overflow-visible px-16"
              ref={emblaRef}
              style={{
                maskImage:
                  'linear-gradient(to right, transparent 0%, black 64px, black calc(100% - 64px), transparent 100%)',
                WebkitMaskImage:
                  'linear-gradient(to right, transparent 0%, black 64px, black calc(100% - 64px), transparent 100%)',
              }}
            >
              <div className="flex gap-6">
                {uploads.map((upload) => (
                  <div
                    key={upload.id}
                    className="min-w-0 flex-[0_0_100%] md:flex-[0_0_calc(50%-12px)] lg:flex-[0_0_calc(33.333%-16px)]"
                  >
                    <MediaCard
                      title={upload.title}
                      thumbnailUrl={upload.thumbnailUrl}
                      channelName={upload.channel.name}
                      channelAvatarUrl={upload.channel.avatarUrl}
                    />
                  </div>
                ))}
                {showViewMoreCard && viewMoreCardText && (
                  <div className="min-w-0 flex-[0_0_100%] md:flex-[0_0_calc(50%-12px)] lg:flex-[0_0_calc(33.333%-16px)]">
                    <ViewMoreCard text={viewMoreCardText} />
                  </div>
                )}
              </div>
            </div>

            <CarouselNavigationButtons
              canScrollPrev={canScrollPrev}
              canScrollNext={canScrollNext}
              onScrollPrev={scrollPrev}
              onScrollNext={scrollNext}
            />
          </div>

          {scrollSnaps.length > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              {scrollSnaps.map((snap, index) => (
                <CarouselPagination
                  key={snap}
                  isActive={index === selectedIndex}
                  onClick={() => scrollTo(index)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <EmptyState
          emptyTitle={emptyTitle}
          emptyBody={emptyBody}
          emptyCta={emptyCta}
        />
      )}
    </div>
  );
}

function RecentlySaved() {
  return (
    <div className="mb-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-medium text-lg text-primary">Recently Saved</h2>
        <button
          type="button"
          className="text-muted text-sm transition-colors hover:text-primary"
        >
          View all
        </button>
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-3">
        {[...Array(9)].map((item, i) => (
          <SavedCard key={item} title={`Saved Content ${i + 1}`} />
        ))}
      </div>
    </div>
  );
}

function TrendingSearches() {
  const searches = [
    'Bible Study',
    'Christian Theology',
    'Worship',
    'Jesus',
    'Prayer Life',
    'Scripture',
    'Faith',
    'Ministry',
    'Sanctification',
    'Grace',
    'Salvation',
    'Trinity',
    'Holy Spirit',
    'Church',
    'Gospel',
    'Hope',
  ];

  return (
    <div className="mb-8">
      <h2 className="mb-6 font-medium text-lg text-primary">
        Trending Searches
      </h2>
      <div className="flex flex-wrap gap-2">
        {searches.map((search) => (
          <button
            key={search}
            type="button"
            className="h-7 rounded-full border-top-highlight bg-gray-900 px-3 font-bold text-primary text-sm"
          >
            {search}
          </button>
        ))}
      </div>
    </div>
  );
}

function MediaGrid({ children }: PropsWithChildren) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

function Home() {
  const { isLoggedIn } = Route.useLoaderData();
  const trpc = useTRPC();

  const { data: trendingUploads } = useSuspenseQuery(
    trpc.home.getTrendingUploads.queryOptions({ limit: 20 }),
  );

  const { data: subscriptionUploads } = useQuery({
    ...trpc.home.getSubscriptionUploads.queryOptions({ limit: 5 }),
    enabled: isLoggedIn,
  });

  const inProgress: ComponentProps<typeof ContentSection>['uploads'] = [];

  return (
    <div className="min-h-screen bg-page">
      <Header />

      <div className="mx-auto max-w-7xl space-y-12 px-16 py-8">
        {inProgress.length > 0 ? (
          <ContentSection title="In Progress" uploads={inProgress} />
        ) : null}

        <ContentSection
          title="Subscriptions"
          uploads={subscriptionUploads || []}
          showViewMoreCard={
            !!(subscriptionUploads && subscriptionUploads.length > 0)
          }
          viewMoreCardText="See more subscribed content"
          emptyTitle="Create an account to follow channels"
          emptyBody="Follow your favorite channels to get a customized feed and to ensure you don't miss new content!"
          emptyCta="Create Account"
        />

        <MediaGrid>
          {trendingUploads.slice(0, 6).map((upload, _i) => (
            <MediaCard
              key={upload.id}
              title={upload?.title ?? 'Untitled'}
              thumbnailUrl={upload?.thumbnailUrl}
              channelName={upload?.channel.name}
              channelAvatarUrl={upload?.channel.avatarUrl}
            />
          ))}
        </MediaGrid>

        <RecentlySaved />

        <MediaGrid>
          {trendingUploads.slice(6, 11).map((upload, _i) => (
            <MediaCard
              key={upload.id}
              title={upload?.title ?? 'Untitled'}
              thumbnailUrl={upload?.thumbnailUrl}
              channelName={upload?.channel.name}
              channelAvatarUrl={upload?.channel.avatarUrl}
            />
          ))}

          <DonateCard />
        </MediaGrid>

        <MediaGrid>
          {trendingUploads.slice(11, 19).map((upload, _i) => (
            <MediaCard
              key={upload.id}
              title={upload?.title ?? 'Untitled'}
              thumbnailUrl={upload?.thumbnailUrl}
              channelName={upload?.channel.name}
              channelAvatarUrl={upload?.channel.avatarUrl}
            />
          ))}

          <SearchCard />
        </MediaGrid>

        <TrendingSearches />

        <MediaGrid>
          {trendingUploads.slice(19).map((upload, _i) => (
            <MediaCard
              key={upload.id}
              title={upload?.title || 'Untitled'}
              thumbnailUrl={upload?.thumbnailUrl}
              channelName={upload?.channel.name}
              channelAvatarUrl={upload?.channel.avatarUrl}
            />
          ))}
        </MediaGrid>
      </div>
    </div>
  );
}
