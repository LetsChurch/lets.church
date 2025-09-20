import { createFileRoute } from '@tanstack/react-router';
import { DonateCard } from '@/components/donate-card';
import Header from '@/components/header';
import { MediaCard } from '@/components/media-card';
import { SavedCard } from '@/components/saved-card';
import { SearchCard } from '@/components/search-card';

export const Route = createFileRoute('/_main/')({
  component: Home,
  loader: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    return {
      isLoggedIn: hasSession,
    };
  },
});

function ContentSection({
  title,
  showViewAll = true,
}: {
  title: string;
  showViewAll?: boolean;
}) {
  return (
    <div className="mb-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-medium text-lg text-primary">{title}</h2>
        {showViewAll && (
          <button
            type="button"
            className="text-muted text-sm transition-colors hover:text-primary"
          >
            View history
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-6">
        {[...Array(4)].map((item, i) => (
          <MediaCard key={item} title={`Sample Content Title ${i + 1}`} />
        ))}
      </div>
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

function Home() {
  return (
    <div className="min-h-screen bg-page">
      <Header />

      <div className="mx-auto max-w-7xl space-y-12 px-16 py-8">
        <ContentSection title="In Progress" />

        <div className="grid grid-cols-3 gap-6">
          {[...Array(6)].map((item, i) => (
            <MediaCard key={item} title={`Sample Content Title ${i + 1}`} />
          ))}
        </div>

        <RecentlySaved />

        <div className="grid grid-cols-3 gap-6">
          {[...Array(5)].map((item, i) => (
            <MediaCard key={item} title={`Sample Content Title ${i + 1}`} />
          ))}

          <DonateCard />
        </div>

        <ContentSection title="Trending" />

        <div className="grid grid-cols-3 gap-6">
          {[...Array(8)].map((item, i) => (
            <MediaCard key={item} title={`Sample Content Title ${i + 1}`} />
          ))}

          <SearchCard />
        </div>

        <TrendingSearches />

        <div className="grid grid-cols-3 gap-6">
          {[...Array(6)].map((item, i) => (
            <MediaCard key={item} title={`Sample Content Title ${i + 1}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
