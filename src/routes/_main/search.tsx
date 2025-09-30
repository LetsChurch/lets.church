import { IconX } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import Header from '@/components/header';
import Search from '@/components/search';
import { TrendingSearchPill } from '@/components/trending-search-pill';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/search')({
  component: RouteComponent,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.home.getTrendingUploads.queryOptions({ limit: 8 }),
    );
  },
});

function RouteComponent() {
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

  const trendingSearches = [
    'What is sanctification?',
    'Christian political theory',
    'Polemics',
    'Christian disagreement on parenting',
  ];

  const removeRecentSearch = (search: string) => {
    setRecentSearches((prev) => prev.filter((s) => s !== search));
  };

  return (
    <div className="min-h-screen bg-page">
      <Header />

      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="mb-6 sm:hidden">
          <Search placeholder="Search or ask anything..." />
        </div>

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
              <div key={upload.id} className="flex gap-3">
                <div className="relative aspect-video w-24 flex-shrink-0 overflow-hidden rounded-lg border border-top-highlight bg-card">
                  {upload.thumbnailUrl ? (
                    <img
                      src={upload.thumbnailUrl}
                      alt={upload.title ?? 'Untitled'}
                      className="size-full object-cover"
                    />
                  ) : null}
                  <div className="absolute right-1 bottom-1 rounded bg-black/80 px-1 text-white text-xs">
                    36:21
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                  <h3 className="line-clamp-2 font-medium text-primary text-sm">
                    {upload.title ?? 'Untitled'}
                  </h3>
                  <p className="text-secondary text-xs">
                    {upload.channel.name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
