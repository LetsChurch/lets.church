import { Autocomplete } from '@base-ui-components/react/autocomplete';
import {
  IconAdjustmentsHorizontal,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import {
  useAddRecentSearch,
  useDeleteRecentSearch,
  useRecentSearches,
} from '@/hooks/use-recent-searches';
import { useSearchFilters } from '@/hooks/use-search-filters';
import { cn } from '@/util/cn';
import { SearchSettingsModal } from './search-settings-modal';

type SearchProps = {
  placeholder?: string;
  className?: string;
  defaultValue?: string;
  channelSlug?: string;
};

export default function SearchBar({
  // placeholder = 'Search or ask anything...', // TODO
  placeholder = 'Search anything...',
  className,
  defaultValue,
  channelSlug,
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
          focus: 'media' as const,
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
          focus: 'media' as const,
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
          focus: 'media' as const,
          channelSlugs: channelSlug ? [channelSlug] : undefined,
        },
      });
    }
  };

  return (
    <Autocomplete.Root defaultValue={defaultValue} items={searchQueries}>
      <form
        onSubmit={handleSubmit}
        className={cn(
          'flex h-10 items-center gap-1 rounded-3xl border px-3 transition-all duration-200',
          'border-gray-950/10 bg-gray-950/5 dark:border-white/10 dark:bg-white/5',
          'hover:border-gray-950/20 hover:bg-gray-950/10 dark:hover:border-white/20 dark:hover:bg-white/10',
          'focus-within:border-white/0 focus-within:shadow-[0_0_0_2px_--theme(--color-white/0.2),0_0_20px_--theme(--color-white/0.3)]',
          className,
        )}
      >
        <div className="min-w-0 flex-1 px-1 pb-0.5">
          <Autocomplete.Input
            name="q"
            placeholder={placeholder}
            className={cn(
              'w-full appearance-none font-medium text-primary text-sm leading-none outline-none',
              'placeholder-gray-950/30 dark:placeholder-white/30',
            )}
          />
        </div>
        <div className="flex shrink-0 items-center gap-0">
          <Autocomplete.Clear
            onClick={handleClear}
            className="flex size-8 items-center justify-center rounded-full text-primary opacity-50 transition-colors hover:bg-white/10 hover:text-primary"
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
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full transition-colors hover:bg-white/10',
                    hasActiveFilters
                      ? 'text-brand hover:text-brand'
                      : 'text-primary opacity-50 hover:text-primary',
                  )}
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
                  <IconSearch size={24} className="text-primary opacity-50" />
                </button>
              )
            }
          </Autocomplete.Value>
        </div>
      </form>

      <Autocomplete.Portal>
        <Autocomplete.Positioner
          sideOffset={8}
          className="z-50 data-empty:hidden"
        >
          <Autocomplete.Popup
            className={cn(
              'hidden overflow-hidden rounded-2xl border border-white/10 bg-black/90 shadow-xl backdrop-blur-lg sm:block',
              'min-w-(--anchor-width)',
            )}
          >
            <Autocomplete.List className="py-2">
              {(search) => (
                <Autocomplete.Item
                  key={search}
                  value={search}
                  onClick={() => handleItemClick(search)}
                  className="cursor-pointer px-4 py-2.5 text-primary/80 text-sm outline-none transition-colors hover:bg-white/10 hover:text-primary data-highlighted:bg-white/10 data-highlighted:text-primary"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <IconSearch
                        size={16}
                        className="text-primary opacity-50"
                      />
                      <span>{search}</span>
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
        onClearFilters={() => {
          setIsSettingsOpen(false);
          clearFilters();
        }}
      />
    </Autocomplete.Root>
  );
}
