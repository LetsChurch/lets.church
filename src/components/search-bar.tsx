import { Autocomplete } from '@base-ui-components/react/autocomplete';
import {
  IconAdjustmentsHorizontal,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import type { FormEvent } from 'react';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import {
  useAddRecentSearch,
  useDeleteRecentSearch,
  useRecentSearches,
} from '@/hooks/use-recent-searches';
import { cn } from '@/util/cn';

type SearchProps = {
  placeholder?: string;
  className?: string;
  defaultValue?: string;
  showFilters?: boolean;
  channelId?: string;
};

export default function SearchBar({
  // placeholder = 'Search or ask anything...', // TODO
  placeholder = 'Search anything...',
  className,
  defaultValue,
  showFilters = false,
  channelId,
}: SearchProps) {
  const navigate = useNavigate();
  const isLoggedIn = useIsLoggedIn();

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
          channelId: channelId ?? undefined,
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
    navigate({
      to: '/search',
      search: {
        q: undefined,
        focus: 'media' as const,
        channelId: undefined,
      },
    });
  };

  return (
    <Autocomplete.Root defaultValue={defaultValue} items={searchQueries}>
      <form
        onSubmit={handleSubmit}
        className={cn(
          'flex h-10 items-center gap-1 rounded-3xl border border-white/10 bg-white/5 px-3 transition-all duration-200 focus-within:border-white/0 focus-within:shadow-[0_0_0_2px_theme(colors.white/0.2),0_0_20px_theme(colors.white/0.3)]',
          className,
        )}
      >
        <div className="min-w-0 flex-1 px-1 pb-0.5">
          <Autocomplete.Input
            name="q"
            placeholder={placeholder}
            className="w-full appearance-none font-medium text-primary text-sm leading-none placeholder-text-muted outline-none placeholder:opacity-30"
          />
        </div>
        <div className="flex flex-shrink-0 items-center gap-0">
          <Autocomplete.Clear
            onClick={handleClear}
            className="flex size-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-primary"
            aria-label="Clear search"
          >
            <IconX size={24} />
          </Autocomplete.Clear>
          {showFilters ? (
            <Autocomplete.Value>
              {(value) =>
                value ? (
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded-full text-primary/50 transition-colors hover:bg-white/10 hover:text-primary"
                    aria-label="Filters"
                  >
                    <IconAdjustmentsHorizontal size={24} />
                  </button>
                ) : null
              }
            </Autocomplete.Value>
          ) : null}
          <Autocomplete.Value>
            {(value) =>
              value ? null : (
                <button
                  type="submit"
                  className="flex size-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <IconSearch size={24} />
                </button>
              )
            }
          </Autocomplete.Value>
        </div>
      </form>

      <Autocomplete.List>
        {(items) =>
          items.length > 0 ? (
            <Autocomplete.Portal>
              <Autocomplete.Positioner sideOffset={8}>
                <Autocomplete.Popup
                  className={cn(
                    'hidden overflow-hidden rounded-2xl border border-white/10 bg-black/90 shadow-xl backdrop-blur-lg sm:block',
                    'min-w-[var(--anchor-width)]',
                  )}
                >
                  <Autocomplete.List className="py-2">
                    {(search) => (
                      <Autocomplete.Item
                        key={search}
                        value={search}
                        className="cursor-pointer px-4 py-2.5 text-sm text-white/80 outline-none transition-colors hover:bg-white/10 hover:text-white data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <IconSearch size={16} className="text-white/50" />
                            <span>{search}</span>
                          </div>
                          {isLoggedIn ? (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSearch(e, search)}
                              className="flex size-6 items-center justify-center text-white/30 transition-colors hover:text-white/60"
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
          ) : null
        }
      </Autocomplete.List>
    </Autocomplete.Root>
  );
}
