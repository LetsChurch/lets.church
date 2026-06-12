import { Autocomplete } from '@base-ui-components/react/autocomplete';
import { IconSearch, IconX } from '@tabler/icons-react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { cva, type VariantProps } from 'class-variance-authority';
import type { FormEvent } from 'react';
import { useRef } from 'react';
import { InfoTip } from '@/components/info-tip';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import {
  useAddRecentSearch,
  useDeleteRecentSearch,
  useRecentSearches,
} from '@/hooks/use-recent-searches';
import { cn } from '@/util/cn';

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

// Explains the three ways to use the bar, shown from the (?) trigger beside it.
const SEARCH_HELP = (
  <div className="max-w-64 space-y-1.5 font-normal text-xs leading-relaxed">
    <p className="font-semibold">How to search</p>
    <ul className="list-disc space-y-1 pl-4 marker:text-primary/40">
      <li>
        <span className="font-semibold">Ask a question</span> (e.g. “What is
        sanctification?”)
      </li>
      <li>
        <span className="font-semibold">Type keywords</span> to search titles,
        descriptions, and transcripts
      </li>
      <li>
        Wrap text in <span className="font-semibold">quotes</span> to match an
        exact phrase
      </li>
    </ul>
  </div>
);

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
}: SearchProps) {
  const navigate = useNavigate({ from: '/search' });
  const location = useLocation();
  const isLoggedIn = useIsLoggedIn();
  const isOnSearchPage = location.pathname === '/search';
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
    // Keyed on the query so the (uncontrolled) input re-syncs when `q` changes
    // via navigation — clicking a suggested/recent search, or a filter that
    // clears the query — not just on first mount. Typing doesn't change `q`, so
    // it never remounts mid-entry.
    <Autocomplete.Root
      key={defaultValue ?? ''}
      defaultValue={defaultValue}
      items={searchQueries}
    >
      <div className={cn('flex w-full items-center gap-1.5', className)}>
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className={cn(searchBarFormVariants({ variant }), 'min-w-0 flex-1')}
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
        <InfoTip
          content={SEARCH_HELP}
          label="How search works"
          className={variant === 'light' ? 'text-white' : undefined}
        />
      </div>

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
    </Autocomplete.Root>
  );
}
