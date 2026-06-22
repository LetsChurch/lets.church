import { Dialog } from '@base-ui/react/dialog';
import {
  IconArrowLeft,
  // IconBookmark,
  IconCheck,
  IconChevronRight,
  // IconFlag,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { cn } from '@/util/cn';
import { MobileDrawer } from './mobile-drawer';

type Channel = {
  id: string;
  name: string;
  slug: string;
  avatarUrl?: string | null;
};

type SearchSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sort?: 'relevance' | 'date-asc' | 'date-desc';
  onSortChange: (sort: 'relevance' | 'date-asc' | 'date-desc') => void;
  dateRange?: 'all-time' | 'today' | 'this-week' | 'this-month' | 'this-year';
  onDateRangeChange: (
    range: 'all-time' | 'today' | 'this-week' | 'this-month' | 'this-year',
  ) => void;
  channelSlugs?: string[];
  onChannelSlugsChange: (channelSlugs: string[] | undefined) => void;
  availableChannels?: Channel[];
  onClearFilters: () => void;
};

type SearchSettingsPage =
  | 'main'
  | 'sorting'
  | 'show-hits'
  | 'date-range'
  | 'search-context'
  | 'channels';

type SearchSettingsContentProps = {
  currentPage: SearchSettingsPage;
  onNavigate: (page: SearchSettingsPage) => void;
  sort: 'relevance' | 'date-asc' | 'date-desc';
  onSortChange: (sort: 'relevance' | 'date-asc' | 'date-desc') => void;
  dateRange: 'all-time' | 'today' | 'this-week' | 'this-month' | 'this-year';
  onDateRangeChange: (
    range: 'all-time' | 'today' | 'this-week' | 'this-month' | 'this-year',
  ) => void;
  channelSlugs: string[];
  onChannelSlugsChange: (channelSlugs: string[] | undefined) => void;
  availableChannels: Channel[];
  onClearFilters: () => void;
};

// Common Components
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="px-1 font-bold text-[10px] text-gray-500 uppercase tracking-[1px] dark:text-zinc-400">
      {children}
    </h3>
  );
}

function Divider() {
  return <div className="my-2 h-px w-full bg-gray-200 dark:bg-zinc-800" />;
}

function BackButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-[7px] transition-colors hover:bg-primary/10"
    >
      <IconArrowLeft size={16} className="shrink-0 text-primary opacity-50" />
      <SectionHeading>{label}</SectionHeading>
    </button>
  );
}

function SelectableOption({
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
      className="flex w-full cursor-pointer items-center justify-between rounded-lg px-1 py-[7px] font-medium text-primary text-sm transition-colors hover:bg-primary/10"
    >
      {children}
      <IconCheck
        size={16}
        className={selected ? 'shrink-0 text-primary' : 'shrink-0 opacity-0'}
      />
    </button>
  );
}

// function FilterOption({
//   icon,
//   label,
//   selected,
// }: {
//   icon: ReactNode;
//   label: string;
//   selected: boolean;
// }) {
//   return (
//     <div className="flex w-full items-center gap-2 rounded-lg py-[7px]">
//       {icon}
//       <p className="font-medium text-primary text-sm">{label}</p>
//       <IconCheck
//         size={16}
//         className={selected ? 'ml-auto shrink-0' : 'ml-auto shrink-0 opacity-0'}
//       />
//     </div>
//   );
// }

function DateRangePage({
  onBack,
  selectedRange,
  onRangeChange,
}: {
  onBack: () => void;
  selectedRange:
    | 'all-time'
    | 'today'
    | 'this-week'
    | 'this-month'
    | 'this-year';
  onRangeChange: (
    range: 'all-time' | 'today' | 'this-week' | 'this-month' | 'this-year',
  ) => void;
}) {
  return (
    <div className="flex w-full flex-col content-stretch items-start gap-1">
      <BackButton onClick={onBack} label="Date Range" />

      <SelectableOption
        onClick={() => onRangeChange('all-time')}
        selected={selectedRange === 'all-time'}
      >
        All Time
      </SelectableOption>

      <SelectableOption
        onClick={() => onRangeChange('today')}
        selected={selectedRange === 'today'}
      >
        Today
      </SelectableOption>

      <SelectableOption
        onClick={() => onRangeChange('this-week')}
        selected={selectedRange === 'this-week'}
      >
        This Week
      </SelectableOption>

      <SelectableOption
        onClick={() => onRangeChange('this-month')}
        selected={selectedRange === 'this-month'}
      >
        This Month
      </SelectableOption>

      <SelectableOption
        onClick={() => onRangeChange('this-year')}
        selected={selectedRange === 'this-year'}
      >
        This Year
      </SelectableOption>

      <Divider />

      <SectionHeading>Custom Range</SectionHeading>

      <div className="flex w-full items-center gap-2">
        <input
          type="date"
          placeholder="Start date"
          className="h-10 grow rounded-3xl border border-gray-950/10 border-solid bg-gray-950/5 px-3 font-medium text-primary text-sm opacity-30 outline-none placeholder:text-primary dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white"
        />
        <span className="font-medium text-primary text-sm dark:text-white">
          –
        </span>
        <input
          type="date"
          placeholder="End date"
          className="h-10 grow rounded-3xl border border-gray-950/10 border-solid bg-gray-950/5 px-3 font-medium text-primary text-sm opacity-30 outline-none placeholder:text-primary dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white"
        />
      </div>
    </div>
  );
}

function ChannelsPage({
  onBack,
  selectedSlugs,
  onSlugsChange,
  availableChannels,
}: {
  onBack: () => void;
  selectedSlugs: string[];
  onSlugsChange: (slugs: string[] | undefined) => void;
  availableChannels: Channel[];
}) {
  const toggleChannel = (slug: string) => {
    const newSlugs = selectedSlugs.includes(slug)
      ? selectedSlugs.filter((s) => s !== slug)
      : [...selectedSlugs, slug];

    onSlugsChange(newSlugs.length > 0 ? newSlugs : undefined);
  };

  // Sort channels alphabetically by name
  const sortedChannels = availableChannels.toSorted((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="flex w-full flex-col content-stretch items-start gap-1">
      <BackButton onClick={onBack} label="Channels" />

      {sortedChannels.map((channel) => (
        <SelectableOption
          key={channel.slug}
          onClick={() => toggleChannel(channel.slug)}
          selected={selectedSlugs.includes(channel.slug)}
        >
          {channel.name}
        </SelectableOption>
      ))}
    </div>
  );
}

function SortingPage({
  onBack,
  selectedSort,
  onSortChange,
}: {
  onBack: () => void;
  selectedSort: 'relevance' | 'date-asc' | 'date-desc';
  onSortChange: (sort: 'relevance' | 'date-asc' | 'date-desc') => void;
}) {
  return (
    <div className="flex w-full flex-col content-stretch items-start gap-1">
      <BackButton onClick={onBack} label="Sorting" />

      <SelectableOption
        onClick={() => onSortChange('relevance')}
        selected={selectedSort === 'relevance'}
      >
        Relevance
      </SelectableOption>

      <SelectableOption
        onClick={() => onSortChange('date-asc')}
        selected={selectedSort === 'date-asc'}
      >
        Date (Oldest First)
      </SelectableOption>

      <SelectableOption
        onClick={() => onSortChange('date-desc')}
        selected={selectedSort === 'date-desc'}
      >
        Date (Newest First)
      </SelectableOption>
    </div>
  );
}

function SearchSettingsContent({
  currentPage,
  onNavigate,
  sort,
  onSortChange,
  dateRange,
  onDateRangeChange,
  channelSlugs,
  onChannelSlugsChange,
  availableChannels,
  onClearFilters,
}: SearchSettingsContentProps) {
  if (currentPage === 'sorting') {
    return (
      <SortingPage
        onBack={() => onNavigate('main')}
        selectedSort={sort}
        onSortChange={onSortChange}
      />
    );
  }

  if (currentPage === 'date-range') {
    return (
      <DateRangePage
        onBack={() => onNavigate('main')}
        selectedRange={dateRange}
        onRangeChange={onDateRangeChange}
      />
    );
  }

  if (currentPage === 'channels') {
    return (
      <ChannelsPage
        onBack={() => onNavigate('main')}
        selectedSlugs={channelSlugs}
        onSlugsChange={onChannelSlugsChange}
        availableChannels={availableChannels}
      />
    );
  }

  const getDateRangeLabel = () => {
    switch (dateRange) {
      case 'today':
        return 'Today';
      case 'this-week':
        return 'This Week';
      case 'this-month':
        return 'This Month';
      case 'this-year':
        return 'This Year';
      default:
        return 'All Time';
    }
  };

  const getSortLabel = () => {
    switch (sort) {
      case 'date-asc':
        return 'Date (Oldest)';
      case 'date-desc':
        return 'Date (Newest)';
      default:
        return 'Relevance';
    }
  };

  const channelFilterLabel =
    channelSlugs.length === 0
      ? 'All Channels'
      : channelSlugs.length === 1
        ? (availableChannels.find((c) => c.slug === channelSlugs[0])?.name ??
          '1 Channel')
        : `${channelSlugs.length} Channels`;

  return (
    <div className="flex w-full flex-col content-stretch items-start gap-1">
      <SectionHeading>Display Options</SectionHeading>

      <button
        type="button"
        onClick={() => onNavigate('sorting')}
        className="flex w-full cursor-pointer items-center rounded-lg px-1 py-[7px] transition-colors hover:bg-primary/10"
      >
        <dl className="flex w-full justify-between">
          <dt className="font-medium text-primary text-sm">Sorting</dt>
          <dd className="flex items-center font-normal text-gray-600 text-xs dark:text-zinc-300">
            {getSortLabel()} <IconChevronRight size={16} className="shrink-0" />
          </dd>
        </dl>
      </button>

      <Divider />

      <SectionHeading>Filters</SectionHeading>

      {availableChannels.length > 0 ? (
        <button
          type="button"
          onClick={() => onNavigate('channels')}
          className="flex w-full cursor-pointer items-center rounded-lg px-1 py-[7px] transition-colors hover:bg-primary/10"
        >
          <dl className="flex w-full justify-between">
            <dt className="font-medium text-primary text-sm">Channels</dt>
            <dd className="flex items-center gap-1 font-normal text-gray-600 text-xs dark:text-zinc-300">
              {channelFilterLabel}{' '}
              <IconChevronRight size={16} className="shrink-0" />
            </dd>
          </dl>
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => onNavigate('date-range')}
        className="flex w-full cursor-pointer items-center rounded-lg px-1 py-[7px] transition-colors hover:bg-primary/10"
      >
        <dl className="flex w-full justify-between">
          <dt className="font-medium text-primary text-sm">Date Range</dt>
          <dd className="flex items-center gap-1 font-normal text-gray-600 text-xs dark:text-zinc-300">
            {getDateRangeLabel()}{' '}
            <IconChevronRight size={16} className="shrink-0" />
          </dd>
        </dl>
      </button>

      <Divider />

      <button
        type="button"
        onClick={onClearFilters}
        className="flex w-full cursor-pointer items-center justify-start rounded-lg px-2 py-[7px] font-medium text-red-500 text-sm transition-colors"
      >
        Clear All Filters
      </button>
    </div>
  );
}

export function SearchSettingsModal({
  open,
  onOpenChange,
  sort = 'relevance',
  onSortChange,
  dateRange = 'all-time',
  onDateRangeChange,
  channelSlugs = [],
  onChannelSlugsChange,
  availableChannels = [],
  onClearFilters,
}: SearchSettingsModalProps) {
  const [currentPage, setCurrentPage] = useState<SearchSettingsPage>('main');
  const [isMobile, setIsMobile] = useState(false);

  // Detect screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Reset to main page when modal closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setCurrentPage('main');
    }
    onOpenChange(newOpen);
  };

  return (
    <>
      {/* Mobile Drawer */}
      {isMobile ? (
        <MobileDrawer.Root open={open} onOpenChange={handleOpenChange}>
          <MobileDrawer.Portal>
            <MobileDrawer.Backdrop />
            <MobileDrawer.Content>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <SearchSettingsContent
                  currentPage={currentPage}
                  onNavigate={setCurrentPage}
                  sort={sort}
                  onSortChange={onSortChange}
                  dateRange={dateRange}
                  onDateRangeChange={onDateRangeChange}
                  channelSlugs={channelSlugs}
                  onChannelSlugsChange={onChannelSlugsChange}
                  availableChannels={availableChannels}
                  onClearFilters={onClearFilters}
                />
              </div>

              {/* Home Indicator */}
              <div className="relative h-[34px] w-full shrink-0">
                <div className="-translate-x-1/2 absolute bottom-2 left-1/2 flex h-[5px] w-36 items-center justify-center">
                  <div className="flex-none rotate-180 scale-y-[-100%]">
                    <div className="h-[5px] w-36 rounded-[100px] bg-gray-950 dark:bg-white" />
                  </div>
                </div>
              </div>
            </MobileDrawer.Content>
          </MobileDrawer.Portal>
        </MobileDrawer.Root>
      ) : (
        /* Desktop Modal */
        <Dialog.Root open={open} onOpenChange={handleOpenChange}>
          <Dialog.Portal>
            <Dialog.Backdrop
              className={cn(
                'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm',
                'transition-opacity duration-300 ease-in-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
              )}
            >
              <Dialog.Popup
                className={cn(
                  'flex max-h-[85vh] w-sm flex-col rounded-2xl border-fancy-pants bg-white shadow-xl dark:bg-zinc-900',
                  'transition-all duration-300 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
                )}
              >
                <div className="overflow-y-auto p-5">
                  <SearchSettingsContent
                    currentPage={currentPage}
                    onNavigate={setCurrentPage}
                    sort={sort}
                    onSortChange={onSortChange}
                    dateRange={dateRange}
                    onDateRangeChange={onDateRangeChange}
                    channelSlugs={channelSlugs}
                    onChannelSlugsChange={onChannelSlugsChange}
                    availableChannels={availableChannels}
                    onClearFilters={onClearFilters}
                  />
                </div>
              </Dialog.Popup>
            </Dialog.Backdrop>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </>
  );
}
