import { Autocomplete } from '@base-ui/react/autocomplete';
import {
  IconAdjustmentsHorizontal,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { cva, type VariantProps } from 'class-variance-authority';
import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import {
  useAddRecentSearch,
  useDeleteRecentSearch,
  useRecentSearches,
} from '@/hooks/use-recent-searches';
import { useSearchFilters } from '@/hooks/use-search-filters';
import { cn } from '@/util/cn';
import { SearchSettingsModal } from './search-settings-modal';

// Form container variants
const searchBarFormVariants = cva(
  'flex h-10 items-center gap-1 rounded-3xl border px-3 backdrop-blur-md transition-all duration-200',
  {
    variants: {
      variant: {
        default: [
          'border-gray-950/15 bg-gray-950/10 shadow-sm dark:border-white/15 dark:bg-white/10',
          'hover:border-gray-950/25 hover:bg-gray-950/15 dark:hover:border-white/25 dark:hover:bg-white/15',
          'focus-within:border-white/0 focus-within:bg-gray-950/20 focus-within:shadow-[0_0_0_2px_--theme(--color-white/0.2),0_0_20px_--theme(--color-white/0.3)] dark:focus-within:bg-white/20',
        ],
        light: [
          'border-white/20 bg-white/15 shadow-sm',
          'hover:border-white/30 hover:bg-white/20',
          'focus-within:border-white/0 focus-within:bg-white/25 focus-within:shadow-[0_0_0_2px_--theme(--color-white/0.3),0_0_20px_--theme(--color-white/0.4)]',
        ],
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

// Input variants
const searchBarInputVariants = cva(
  'w-full appearance-none font-medium text-sm leading-none outline-none',
  {
    variants: {
      variant: {
        default:
          'text-primary placeholder-gray-950/30 dark:placeholder-white/30',
        light: 'text-white placeholder-white/50',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

// Button variants (with isActive for filter button)
const searchBarButtonVariants = cva(
  'flex size-8 items-center justify-center rounded-full transition-colors hover:bg-white/10',
  {
    variants: {
      variant: {
        default: 'text-primary hover:text-primary',
        light: 'text-white hover:text-white',
      },
      isActive: {
        true: 'text-brand hover:text-brand opacity-100',
        false: 'opacity-50',
      },
    },
    compoundVariants: [
      {
        variant: ['default', 'light'],
        isActive: true,
        className: 'text-brand hover:text-brand opacity-100',
      },
    ],
    defaultVariants: {
      variant: 'default',
      isActive: false,
    },
  },
);

// Icon variants
const searchBarIconVariants = cva('', {
  variants: {
    variant: {
      default: 'text-primary',
      light: 'text-white',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type Channel = {
  id: string;
  name: string;
  slug: string;
  avatarUrl?: string | null;
};

type SearchProps = {
  placeholder?: string;
  className?: string;
  defaultValue?: string;
  channelSlug?: string;
  availableChannels?: Channel[];
} & VariantProps<typeof searchBarFormVariants>;

export default function SearchBar({
  // placeholder = 'Search or ask anything...', // TODO
  placeholder = 'Search anything...',
  className,
  defaultValue,
  channelSlug,
  variant,
  availableChannels = [],
}: SearchProps) {
  const navigate = useNavigate({ from: '/search' });
  const location = useLocation();
  const {
    filters,
    setSort,
    setDateRange,
    setChannelSlugs,
    clearFilters,
    hasActiveFilters,
  } = useSearchFilters();
  const isLoggedIn = useIsLoggedIn();
  const isOnSearchPage = location.pathname === '/search';
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const { data: recentSearches = [] } = useRecentSearches();
  const { addSearch } = useAddRecentSearch();
  const deleteSearchMutation = useDeleteRecentSearch();

  // Extract just the query strings for the autocomplete
  const searchQueries = recentSearches.map((s) => s.query);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const searchQuery = formData.get('q') as string;

    if (searchQuery.trim()) {
      // Optimistically update the cache if logged in
      if (isLoggedIn) {
        addSearch(searchQuery);
      }

      navigate({
        to: '/search',
        search: {
          q: searchQuery,
          channelSlugs: channelSlug ? [channelSlug] : undefined,
        },
      });
    }
  };

  const handleDeleteSearch = (
    e: React.MouseEvent,
    searchQuery: string,
  ): void => {
    e.stopPropagation();
    e.preventDefault();
    deleteSearchMutation.mutate({ query: searchQuery });
  };

  const handleClear = () => {
    if (isOnSearchPage) {
      navigate({
        to: '/search',
        search: {
          q: undefined,
          channelSlugs: undefined,
        },
      });
    }
  };

  const handleItemClick = (searchQuery: string) => {
    if (searchQuery.trim()) {
      // Optimistically update the cache if logged in
      if (isLoggedIn) {
        addSearch(searchQuery);
      }

      navigate({
        to: '/search',
        search: {
          q: searchQuery,
          channelSlugs: channelSlug ? [channelSlug] : undefined,
        },
      });
    }
  };

  return (
    <Autocomplete.Root defaultValue={defaultValue} items={searchQueries}>
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className={cn(searchBarFormVariants({ variant }), className)}
      >
        <div className="min-w-0 flex-1 px-1 pb-0.5">
          <Autocomplete.Input
            name="q"
            type="search"
            placeholder={placeholder}
            className={searchBarInputVariants({ variant })}
          />
        </div>
        <div className="flex shrink-0 items-center gap-0">
          <Autocomplete.Clear
            onClick={handleClear}
            className={searchBarButtonVariants({ variant, isActive: false })}
            aria-label="Clear search"
          >
            <IconX size={24} />
          </Autocomplete.Clear>
          <Autocomplete.Value>
            {(value) =>
              value && isOnSearchPage ? (
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className={searchBarButtonVariants({
                    variant,
                    isActive: hasActiveFilters,
                  })}
                  aria-label="Filters"
                >
                  <IconAdjustmentsHorizontal size={24} />
                </button>
              ) : null
            }
          </Autocomplete.Value>
          <Autocomplete.Value>
            {(value) =>
              value ? null : (
                <button
                  type="submit"
                  className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
                >
                  <IconSearch
                    size={24}
                    className={cn(
                      'opacity-50',
                      searchBarIconVariants({ variant }),
                    )}
                  />
                </button>
              )
            }
          </Autocomplete.Value>
        </div>
      </form>

      <Autocomplete.Portal>
        <Autocomplete.Positioner
          anchor={formRef}
          sideOffset={8}
          className="z-50 data-empty:hidden"
        >
          <Autocomplete.Popup
            className={cn(
              'hidden overflow-hidden rounded-2xl border border-gray-950/10 bg-white/90 shadow-xl backdrop-blur-lg sm:block dark:border-white/10 dark:bg-black/90',
              'w-(--anchor-width)',
            )}
          >
            <Autocomplete.List className="py-2">
              {(search) => (
                <Autocomplete.Item
                  key={search}
                  value={search}
                  onClick={() => handleItemClick(search)}
                  className="cursor-pointer px-4 py-2.5 text-primary/80 text-sm outline-none transition-colors hover:bg-gray-950/5 hover:text-primary data-highlighted:bg-gray-950/5 data-highlighted:text-primary dark:data-highlighted:bg-white/10 dark:hover:bg-white/10"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <IconSearch
                        size={16}
                        className="shrink-0 text-primary opacity-50"
                      />
                      <span className="truncate">{search}</span>
                    </div>
                    {isLoggedIn ? (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSearch(e, search)}
                        className="flex size-6 items-center justify-center text-primary/30 transition-colors hover:text-primary/60"
                        aria-label={`Remove ${search}`}
                      >
                        <IconX size={14} />
                      </button>
                    ) : null}
                  </div>
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>

      <SearchSettingsModal
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        sort={filters.sort}
        onSortChange={setSort}
        dateRange={filters.dateRange}
        onDateRangeChange={setDateRange}
        channelSlugs={filters.channelSlugs}
        onChannelSlugsChange={setChannelSlugs}
        availableChannels={availableChannels}
        onClearFilters={() => {
          setIsSettingsOpen(false);
          clearFilters();
        }}
      />
    </Autocomplete.Root>
  );
}
