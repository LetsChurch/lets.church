import { IconSearch } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import Header from '@/components/header';

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
            View all
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-6">
        {[...Array(4)].map((item, i) => (
          <div key={item} className="space-y-3">
            <div className="aspect-[16/9] rounded-lg border border-card bg-card" />
            <div className="space-y-1">
              <h3 className="line-clamp-2 font-medium text-primary text-sm">
                Sample Content Title {i + 1}
              </h3>
              <p className="text-secondary text-xs">Channel Name</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentlyViewed() {
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

      <div className="grid grid-cols-3 gap-6">
        {[...Array(3)].map((col, colIndex) => (
          <div key={col} className="space-y-3">
            {[...Array(3)].map((row, rowIndex) => (
              <div
                key={row}
                className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-overlay"
              >
                <div className="h-12 w-16 flex-shrink-0 rounded border border-card bg-card" />
                <div className="min-w-0 flex-1">
                  <h4 className="line-clamp-1 font-medium text-primary text-sm">
                    Saved Content {colIndex * 3 + rowIndex + 1}
                  </h4>
                  <p className="text-secondary text-xs">Channel</p>
                </div>
              </div>
            ))}
          </div>
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
            className="rounded-full border border-default bg-overlay px-3 py-1.5 text-primary text-sm transition-colors hover:bg-overlay-strong"
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
          {[...Array(6)].map((item) => (
            <div
              key={item}
              className="aspect-[4/3] rounded-lg border border-card bg-card"
            />
          ))}
        </div>

        <RecentlyViewed />

        <div className="grid grid-cols-3 gap-6">
          {[...Array(5)].map((item) => (
            <div
              key={item}
              className="aspect-[4/3] rounded-lg border border-card bg-card"
            />
          ))}

          {/* Special help card */}
          <div className="flex flex-col justify-between rounded-lg border border-card bg-card p-6">
            <div className="space-y-3">
              <h3 className="font-medium text-lg text-primary">
                Help share the good news
              </h3>
              <p className="text-secondary text-sm leading-relaxed">
                Let's Church will always remain free and without ads, sustained
                only by donations. Would you consider giving to keep our
                platform running?
              </p>
            </div>
            <button
              type="button"
              className="mt-4 self-end rounded-lg bg-indigo-500 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-indigo-600"
            >
              Donate
            </button>
          </div>
        </div>

        <ContentSection title="Trending" />

        <div className="grid grid-cols-3 gap-6">
          {[...Array(8)].map((item) => (
            <div
              key={item}
              className="aspect-[4/3] rounded-lg border border-card bg-card"
            />
          ))}

          {/* Special search card */}
          <div className="flex flex-col justify-between rounded-lg border border-card bg-card p-6">
            <div className="space-y-3">
              <h3 className="font-medium text-lg text-primary">
                Easily discover relevant content
              </h3>
              <p className="text-secondary text-sm leading-relaxed">
                Search by topic, bible verse, ask questions, and just about
                anything else. We'll check transcripts and use AI-powered logic
                to find matches.
              </p>
            </div>
            <div className="mt-4">
              <div className="flex items-center gap-2 rounded-lg border border-default bg-overlay p-3">
                <input
                  type="text"
                  placeholder="Try searching..."
                  className="flex-1 bg-transparent text-primary text-sm placeholder-text-muted outline-none"
                />
                <IconSearch />
              </div>
            </div>
          </div>
        </div>

        <TrendingSearches />

        <div className="grid grid-cols-3 gap-6">
          {[...Array(9)].map((item) => (
            <div
              key={item}
              className="aspect-[4/3] rounded-lg border border-card bg-card"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
