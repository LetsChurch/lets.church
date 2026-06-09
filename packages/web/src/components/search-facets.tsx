import { IconAdjustmentsHorizontal, IconCheck } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useSearchFilters } from '@/hooks/use-search-filters';
import { cn } from '@/util/cn';
import { MobileDrawer } from './mobile-drawer';

type Channel = {
  id: string;
  name: string;
  slug: string;
  avatarUrl?: string | null;
};

type DateRange =
  | 'all-time'
  | 'today'
  | 'this-week'
  | 'this-month'
  | 'this-year';

const DATE_RANGE_OPTIONS: ReadonlyArray<{ value: DateRange; label: string }> = [
  { value: 'all-time', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'this-week', label: 'This Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'this-year', label: 'This Year' },
];

type Sort = 'relevance' | 'date-asc' | 'date-desc';

const SORT_OPTIONS: ReadonlyArray<{ value: Sort; label: string }> = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'date-desc', label: 'Date (Newest First)' },
  { value: 'date-asc', label: 'Date (Oldest First)' },
];

type SectionProps = { title: string; children: ReactNode };

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="px-1 font-bold text-[10px] text-gray-500 uppercase tracking-[1px] dark:text-zinc-400">
      {children}
    </h3>
  );
}

// Desktop: each section is its own bordered card (the sidebar).
function FacetBlock({ title, children }: SectionProps) {
  return (
    <div className="rounded-2xl border-fancy-pants bg-zinc-100 p-4 dark:bg-zinc-900">
      <div className="mb-2">
        <SectionHeading>{title}</SectionHeading>
      </div>
      <div className="flex flex-col items-start">{children}</div>
    </div>
  );
}

// Mobile: plain sections inside the drawer — no nested card chrome.
function FacetSection({ title, children }: SectionProps) {
  return (
    <div>
      <div className="mb-1">
        <SectionHeading>{title}</SectionHeading>
      </div>
      <div className="flex flex-col items-start">{children}</div>
    </div>
  );
}

function FacetOption({
  onClick,
  selected,
  children,
}: {
  onClick: () => void;
  selected: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-1 py-[7px] text-left font-medium text-primary text-sm transition-colors hover:bg-primary/10"
    >
      <span className="min-w-0 truncate">{children}</span>
      <IconCheck
        size={16}
        className={selected ? 'shrink-0 text-primary' : 'shrink-0 opacity-0'}
      />
    </button>
  );
}

/**
 * The faceting controls for the search page. On desktop (`bordered`) each
 * section is its own card forming the right-hand sidebar; in the mobile drawer
 * (`bordered={false}`) the sections are listed plainly without nested card
 * chrome. All state lives in the URL via `useSearchFilters`, so selections
 * survive navigation and are shared with the rest of the page.
 */
export function SearchFacets({
  availableChannels = [],
  bordered = true,
}: {
  availableChannels?: Channel[];
  bordered?: boolean;
}) {
  const Section = bordered ? FacetBlock : FacetSection;
  const {
    filters,
    hasCustomDates,
    setSort,
    setDateRange,
    setCustomDates,
    setChannelSlugs,
    clearFilters,
    hasActiveFilters,
  } = useSearchFilters();

  const selectedSlugs = filters.channelSlugs ?? [];
  const dateRange = filters.dateRange ?? 'all-time';
  const dateStart = filters.dateStart ?? '';
  const dateEnd = filters.dateEnd ?? '';
  const sort = filters.sort ?? 'relevance';

  const toggleChannel = (slug: string) => {
    const next = selectedSlugs.includes(slug)
      ? selectedSlugs.filter((s) => s !== slug)
      : [...selectedSlugs, slug];
    setChannelSlugs(next.length > 0 ? next : undefined);
  };

  // Keep selected channels visible even if they drop out of the faceted set
  // (e.g. a pre-filled channel whose scoped results don't surface it back).
  const channels = [...availableChannels].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className={bordered ? 'space-y-4' : 'space-y-6'}>
      <Section title="Sort">
        {SORT_OPTIONS.map((option) => (
          <FacetOption
            key={option.value}
            onClick={() => setSort(option.value)}
            selected={sort === option.value}
          >
            {option.label}
          </FacetOption>
        ))}
      </Section>

      {channels.length > 0 ? (
        <Section title="Channels">
          <div className="max-h-72 w-full overflow-y-auto">
            {channels.map((channel) => (
              <FacetOption
                key={channel.slug}
                onClick={() => toggleChannel(channel.slug)}
                selected={selectedSlugs.includes(channel.slug)}
              >
                {channel.name}
              </FacetOption>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Date">
        {DATE_RANGE_OPTIONS.map((option) => (
          <FacetOption
            key={option.value}
            onClick={() => setDateRange(option.value)}
            selected={!hasCustomDates && dateRange === option.value}
          >
            {option.label}
          </FacetOption>
        ))}

        <div className="mt-2 w-full border-gray-200 border-t pt-2 dark:border-zinc-800">
          <div className="mb-1 px-1">
            <SectionHeading>Custom range</SectionHeading>
          </div>
          <div className="flex flex-col gap-2 px-1">
            <label className="flex items-center justify-between gap-2 font-medium text-primary text-sm">
              <span className="text-muted">From</span>
              <input
                type="date"
                value={dateStart}
                max={dateEnd || undefined}
                onChange={(e) =>
                  setCustomDates(
                    e.target.value || undefined,
                    dateEnd || undefined,
                  )
                }
                className="h-8 rounded-lg border border-gray-950/10 bg-gray-950/5 px-2 text-primary text-sm outline-none dark:border-white/10 dark:bg-white/5 dark:[color-scheme:dark]"
              />
            </label>
            <label className="flex items-center justify-between gap-2 font-medium text-primary text-sm">
              <span className="text-muted">To</span>
              <input
                type="date"
                value={dateEnd}
                min={dateStart || undefined}
                onChange={(e) =>
                  setCustomDates(
                    dateStart || undefined,
                    e.target.value || undefined,
                  )
                }
                className="h-8 rounded-lg border border-gray-950/10 bg-gray-950/5 px-2 text-primary text-sm outline-none dark:border-white/10 dark:bg-white/5 dark:[color-scheme:dark]"
              />
            </label>
          </div>
        </div>
      </Section>

      {hasActiveFilters ? (
        <button
          type="button"
          onClick={clearFilters}
          className="w-full cursor-pointer px-1 py-2 text-left font-medium text-red-500 text-sm transition-colors hover:text-red-400"
        >
          Clear all filters
        </button>
      ) : null}
    </div>
  );
}

/**
 * Mobile entry point for the facets: a "Filters" button that opens a bottom
 * drawer holding the same blocks as the desktop sidebar.
 */
export function MobileFacets({
  availableChannels = [],
}: {
  availableChannels?: Channel[];
}) {
  const [open, setOpen] = useState(false);
  const { hasActiveFilters } = useSearchFilters();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex items-center gap-2 rounded-full border px-4 py-2 font-medium text-sm transition-colors',
          hasActiveFilters
            ? 'border-brand/40 bg-brand/10 text-brand'
            : 'border-gray-950/15 text-primary hover:bg-primary/10 dark:border-white/15',
        )}
      >
        <IconAdjustmentsHorizontal size={18} />
        Filters
      </button>

      <MobileDrawer.Root open={open} onOpenChange={setOpen}>
        <MobileDrawer.Portal>
          <MobileDrawer.Backdrop />
          <MobileDrawer.Content>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-8">
              <SearchFacets
                availableChannels={availableChannels}
                bordered={false}
              />
            </div>
          </MobileDrawer.Content>
        </MobileDrawer.Portal>
      </MobileDrawer.Root>
    </>
  );
}
