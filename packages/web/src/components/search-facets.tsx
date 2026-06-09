import {
  IconAdjustmentsHorizontal,
  IconCheck,
  IconChevronDown,
  IconSparkles,
} from '@tabler/icons-react';
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

// The parser's date recommendation: a current-period bucket (marks that bucket
// option) or an absolute range with an optional relative label (marks an
// applyable chip in the custom-range block).
export type DateSuggestion =
  | {
      kind: 'bucket';
      bucket: 'today' | 'this-week' | 'this-month' | 'this-year';
    }
  | {
      kind: 'range';
      gte: string | null;
      lte: string | null;
      label: string | null;
    };

// Human-friendly label for a date-only ("YYYY-MM-DD") bound, collapsing a
// year-boundary date to the year so "since 2020" reads as "Since 2020".
function formatBound(iso: string, edge: 'start' | 'end'): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  if (edge === 'start' && m === 1 && d === 1) return String(y);
  if (edge === 'end' && m === 12 && d === 31) return String(y);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Label for a recommended custom range ("Past month", "Since 2020", "2020 –
// 2022", "Through 2018"). Prefers the parser's relative label when present.
function rangeLabel(s: {
  gte: string | null;
  lte: string | null;
  label: string | null;
}): string {
  if (s.label) return s.label;
  if (s.gte && s.lte) {
    return `${formatBound(s.gte, 'start')} – ${formatBound(s.lte, 'end')}`;
  }
  if (s.gte) return `Since ${formatBound(s.gte, 'start')}`;
  // `lte` is an inclusive upper bound, so "Through" reads more accurately.
  if (s.lte) return `Through ${formatBound(s.lte, 'end')}`;
  return 'Custom range';
}

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
  recommended = false,
  children,
}: {
  onClick: () => void;
  selected: boolean;
  // Marks an AI-recommended option with a sparkle.
  recommended?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-1 py-[7px] text-left font-medium text-primary text-sm transition-colors hover:bg-primary/10"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate">{children}</span>
        {recommended ? (
          <IconSparkles
            size={14}
            className="shrink-0 text-indigo-500 dark:text-indigo-300"
            aria-hidden="true"
          />
        ) : null}
        {recommended ? <span className="sr-only"> (recommended)</span> : null}
      </span>
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
  channelsLoading = false,
  recommendedChannelSlugs = [],
  recommendedDate = null,
}: {
  availableChannels?: Channel[];
  bordered?: boolean;
  /** Show placeholder rows in the Channels section while results load. */
  channelsLoading?: boolean;
  /** Channel slugs the parser recommends — marked with a sparkle in the list. */
  recommendedChannelSlugs?: ReadonlyArray<string>;
  /** Date the parser recommends — marks the matching bucket, or surfaces an
   * applyable chip in the custom-range block for an absolute/relative range. */
  recommendedDate?: DateSuggestion | null;
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

  // Custom range is a collapsed disclosure by default (keeps the Date facet
  // compact); it's also shown whenever a custom range is currently applied.
  const [customOpen, setCustomOpen] = useState(false);
  const showCustom = customOpen || hasCustomDates;

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

  const recommendedSlugs = new Set(recommendedChannelSlugs);
  const recommendedBucket =
    recommendedDate?.kind === 'bucket' ? recommendedDate.bucket : null;
  const recommendedRange =
    recommendedDate?.kind === 'range' ? recommendedDate : null;

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
                recommended={recommendedSlugs.has(channel.slug)}
              >
                {channel.name}
              </FacetOption>
            ))}
          </div>
        </Section>
      ) : channelsLoading ? (
        <Section title="Channels">
          <div className="w-full space-y-2 py-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-5 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800"
                style={{ width: `${85 - i * 8}%` }}
              />
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Date">
        {DATE_RANGE_OPTIONS.map((option) => (
          <FacetOption
            key={option.value}
            onClick={() => {
              setDateRange(option.value);
              setCustomOpen(false);
            }}
            selected={!hasCustomDates && dateRange === option.value}
            recommended={option.value === recommendedBucket}
          >
            {option.label}
          </FacetOption>
        ))}

        {/* Recommended custom range, presented as another date option (with the
            sparkle suffix) so it sits cleanly in the list. Applying it sets the
            custom range — which then surfaces in "Choose dates". */}
        {recommendedRange ? (
          <FacetOption
            onClick={() =>
              setCustomDates(
                recommendedRange.gte ?? undefined,
                recommendedRange.lte ?? undefined,
              )
            }
            selected={false}
            recommended
          >
            {rangeLabel(recommendedRange)}
          </FacetOption>
        ) : null}

        {/* Custom range disclosure: collapsed until opened (or a range is
            active). When set, the trigger shows the applied range + a dot. */}
        <button
          type="button"
          onClick={() => setCustomOpen((o) => !o)}
          aria-expanded={showCustom}
          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-1 py-[7px] text-left font-medium text-primary text-sm transition-colors hover:bg-primary/10"
        >
          <span className="min-w-0 truncate">
            {hasCustomDates
              ? rangeLabel({
                  gte: dateStart || null,
                  lte: dateEnd || null,
                  label: null,
                })
              : 'Choose dates'}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {hasCustomDates ? (
              <span
                className="size-1.5 rounded-full bg-brand"
                aria-hidden="true"
              />
            ) : null}
            <IconChevronDown
              size={16}
              className={cn(
                'shrink-0 text-muted transition-transform',
                showCustom && 'rotate-180',
              )}
            />
          </span>
        </button>

        {showCustom ? (
          <div className="mt-1 w-full space-y-2 px-1">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 font-medium text-muted text-xs">
                From
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
              <label className="flex flex-col gap-1 font-medium text-muted text-xs">
                To
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
            {hasCustomDates ? (
              <button
                type="button"
                onClick={() => {
                  setCustomDates(undefined, undefined);
                  setCustomOpen(false);
                }}
                className="cursor-pointer font-medium text-red-500 text-xs transition-colors hover:text-red-400"
              >
                Clear dates
              </button>
            ) : null}
          </div>
        ) : null}
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
 * drawer holding the same blocks as the desktop sidebar. AI recommendations are
 * marked inline in the facet list (sparkles); the button shows a badge with how
 * many are on offer so they're discoverable without opening the drawer.
 */
export function MobileFacets({
  availableChannels = [],
  channelsLoading = false,
  recommendedChannelSlugs = [],
  recommendedDate = null,
}: {
  availableChannels?: Channel[];
  channelsLoading?: boolean;
  recommendedChannelSlugs?: ReadonlyArray<string>;
  recommendedDate?: DateSuggestion | null;
}) {
  const [open, setOpen] = useState(false);
  const { hasActiveFilters } = useSearchFilters();

  const suggestionCount =
    recommendedChannelSlugs.length + (recommendedDate ? 1 : 0);

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
        {suggestionCount > 0 ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-500/15 py-0.5 pr-1.5 pl-1 font-semibold text-[11px] text-indigo-600 dark:text-indigo-300">
            <IconSparkles size={11} aria-hidden="true" />
            <span aria-hidden="true">{suggestionCount}</span>
            <span className="sr-only">
              {suggestionCount} suggested{' '}
              {suggestionCount === 1 ? 'filter' : 'filters'}
            </span>
          </span>
        ) : null}
      </button>

      <MobileDrawer.Root open={open} onOpenChange={setOpen}>
        <MobileDrawer.Portal>
          <MobileDrawer.Backdrop />
          <MobileDrawer.Content>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-8">
              <SearchFacets
                availableChannels={availableChannels}
                bordered={false}
                channelsLoading={channelsLoading}
                recommendedChannelSlugs={recommendedChannelSlugs}
                recommendedDate={recommendedDate}
              />
            </div>
          </MobileDrawer.Content>
        </MobileDrawer.Portal>
      </MobileDrawer.Root>
    </>
  );
}
