import { IconX } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { AvatarCarousel } from '@/components/avatar-carousel';
import Header from '@/components/header';
import { MediaCompactCard } from '@/components/media-compact-card';
import Search from '@/components/search';
import SearchTabs from '@/components/search-tabs';
import { TrendingSearchPill } from '@/components/trending-search-pill';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/search')({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>) => ({
    q: search.q as string | undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: async ({ context, deps }) => {
    console.log('Search query:', deps.q);
    await context.queryClient.ensureQueryData(
      context.trpc.home.getTrendingUploads.queryOptions({ limit: 8 }),
    );
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

        {q ? <SearchResults /> : <EmptySearch />}
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

const sampleUploads = [
  {
    id: '1',
    title:
      'The Passionate Pursuit of Holiness (Hebrews 12:14) | Worship Service',
    thumbnailUrl: null,
    channelName: 'Kootenai Church',
    timestamp: 'Yesterday',
  },
  {
    id: '2',
    title: 'Understanding Biblical Sanctification',
    thumbnailUrl: null,
    channelName: 'Grace Community Church',
    timestamp: '2 days ago',
  },
  {
    id: '3',
    title: 'The Doctrine of Election Explained',
    thumbnailUrl: null,
    channelName: 'Reformed Theological Seminary',
    timestamp: '3 days ago',
  },
  {
    id: '4',
    title: 'Expository Preaching Through Romans 8',
    thumbnailUrl: null,
    channelName: 'Christ Chapel Bible Church',
    timestamp: '1 week ago',
  },
  {
    id: '5',
    title: 'The Five Solas of the Reformation',
    thumbnailUrl: null,
    channelName: 'Ligonier Ministries',
    timestamp: '1 week ago',
  },
];

function SearchResults() {
  return (
    <div className="space-y-8">
      <SearchTabs mediaCount={99} />

      <div className="space-y-4">
        <h2 className="font-medium text-primary">Channels</h2>
        <AvatarCarousel items={[{ id: 'foo', name: 'Foo' }]} />
      </div>

      <div className="space-y-4">
        {sampleUploads.map((upload) => (
          <MediaCompactCard
            key={upload.id}
            title={upload.title}
            thumbnailUrl={upload.thumbnailUrl}
            channelName={upload.channelName}
            channelImageUrl={null}
            timestamp={upload.timestamp}
          />
        ))}
      </div>

      <div className="space-y-4">
        <h2 className="font-medium text-primary">Churches</h2>
        <AvatarCarousel items={[{ id: 'foo', name: 'Foo' }]} />
      </div>

      <div className="space-y-4">
        {sampleUploads.map((upload) => (
          <MediaCompactCard
            key={`church-${upload.id}`}
            title={upload.title}
            thumbnailUrl={upload.thumbnailUrl}
            channelName={upload.channelName}
            channelImageUrl={null}
            timestamp={upload.timestamp}
          />
        ))}
      </div>

      <div className="space-y-4">
        <h2 className="font-medium text-primary">Related Searches</h2>
        <div className="flex flex-wrap gap-2">
          {trendingSearches.map((search) => (
            <TrendingSearchPill key={search} search={search} />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {sampleUploads.map((upload) => (
          <MediaCompactCard
            key={`related-${upload.id}`}
            title={upload.title}
            thumbnailUrl={upload.thumbnailUrl}
            channelName={upload.channelName}
            channelImageUrl={null}
            timestamp={upload.timestamp}
          />
        ))}
      </div>
    </div>
  );
}

function EmptySearch() {
  const trpc = useTRPC();
  const { data: trendingUploads } = useSuspenseQuery(
    trpc.home.getTrendingUploads.queryOptions({ limit: 8 }),
  );

  const [recentSearches, setRecentSearches] = useState([
    'Politics',
    'Sanctification',
    'Eschatology',
    'Sex',
    'Gluttony',
  ]);

  const removeRecentSearch = (search: string) => {
    setRecentSearches((prev) => prev.filter((s) => s !== search));
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
      {recentSearches.length > 0 ? (
        <div className="border-white/10 border-b py-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium text-lg text-primary">
              Recent Searches
            </h2>
            <button
              type="button"
              className="text-muted text-sm transition-colors hover:text-primary"
            >
              View All
            </button>
          </div>
          <div className="space-y-2">
            {recentSearches.map((search) => (
              <div
                key={search}
                className="flex items-center justify-between py-1"
              >
                <button
                  type="button"
                  className="flex-1 text-left text-primary transition-colors hover:text-white"
                >
                  {search}
                </button>
                <button
                  type="button"
                  onClick={() => removeRecentSearch(search)}
                  className="flex size-7 items-center justify-center text-muted transition-colors hover:text-primary"
                  aria-label={`Remove ${search}`}
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
