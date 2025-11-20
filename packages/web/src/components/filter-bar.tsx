import { IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import useEmblaCarousel from 'embla-carousel-react';
import WheelGestures from 'embla-carousel-wheel-gestures';
import { useSearchFilters } from '@/hooks/use-search-filters';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';

type FilterBadgeProps = {
  label: string;
  onRemove: () => void;
};

function FilterBadge({ label, onRemove }: FilterBadgeProps) {
  return (
    <div
      className={cn(
        'group relative isolate flex h-5 shrink-0 items-center gap-1.5 rounded-full border pr-1 pl-3 font-medium text-xs backdrop-blur-sm',
        'border-gray-950/10 bg-gray-950/10 text-primary/80',
        'dark:border-white/10 dark:bg-white/15',
        'md:overflow-hidden md:pr-3',
      )}
    >
      <span className="relative">{label}</span>
      <div
        className={cn(
          'pointer-events-none absolute top-0 right-0 bottom-0 w-16 opacity-0 transition-opacity',
          'bg-gradient-to-r from-transparent via-white/50 to-white',
          'dark:via-zinc-950/50 dark:to-zinc-950',
          'hidden md:block md:group-hover:opacity-100',
        )}
      />
      <button
        type="button"
        onClick={onRemove}
        className="md:-translate-y-1/2 relative flex size-4 items-center justify-center md:absolute md:top-1/2 md:right-2 md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
        aria-label={`Remove ${label} filter`}
      >
        <IconX size={12} className="text-primary/80" />
      </button>
    </div>
  );
}

export function FilterBar() {
  const {
    filters,
    setSort,
    setDateRange,
    removeChannelSlug,
    hasActiveFilters,
  } = useSearchFilters();
  const trpc = useTRPC();
  const searchParams = useSearch({ strict: false }) as {
    q?: string;
    focus?: 'media' | 'transcripts';
  };

  const [emblaRef] = useEmblaCarousel(
    {
      align: 'start',
      dragFree: true,
    },
    [WheelGestures()],
  );

  // Get available channels from search results to display channel names
  const { data: searchData } = useQuery({
    ...trpc.search.performSearch.queryOptions({
      q: searchParams.q ?? '',
      focus: searchParams.focus ?? 'media',
      channelSlugs: filters.channelSlugs,
      limit: 20,
      sort: filters.sort,
      dateRange: filters.dateRange,
    }),
    enabled: Boolean(searchParams.q),
  });

  const availableChannels =
    searchData?.channels ??
    ([] as Array<{
      id: string;
      name: string;
      slug: string;
      avatarUrl?: string | null;
    }>);

  if (!hasActiveFilters) {
    return null;
  }

  const badges: Array<{ key: string; label: string; onRemove: () => void }> =
    [];

  // Sort filter
  if (filters.sort && filters.sort !== 'relevance') {
    const sortLabels = {
      'date-asc': 'Oldest First',
      'date-desc': 'Newest First',
    };
    badges.push({
      key: 'sort',
      label: sortLabels[filters.sort],
      onRemove: () => setSort(undefined),
    });
  }

  // Date range filter
  if (filters.dateRange && filters.dateRange !== 'all-time') {
    const dateRangeLabels = {
      today: 'Today',
      'this-week': 'This Week',
      'this-month': 'This Month',
      'this-year': 'This Year',
    };
    badges.push({
      key: 'dateRange',
      label: dateRangeLabels[filters.dateRange],
      onRemove: () => setDateRange(undefined),
    });
  }

  // Channel filters
  if (filters.channelSlugs && filters.channelSlugs.length > 0) {
    for (const slug of filters.channelSlugs) {
      const channel = availableChannels.find((c) => c.slug === slug);
      badges.push({
        key: `channel-${slug}`,
        label: channel?.name || slug,
        onRemove: () => removeChannelSlug(slug),
      });
    }
  }

  return (
    <div className="overflow-hidden" ref={emblaRef}>
      <div className="flex gap-2">
        {badges.map((badge) => (
          <FilterBadge
            key={badge.key}
            label={badge.label}
            onRemove={badge.onRemove}
          />
        ))}
      </div>
    </div>
  );
}
