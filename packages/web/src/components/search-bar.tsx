import { Autocomplete } from '@base-ui-components/react/autocomplete';
import {
  IconHistory,
  IconSearch,
  IconSparkles,
  IconX,
} from '@tabler/icons-react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { cva, type VariantProps } from 'class-variance-authority';
import type { FormEvent } from 'react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { InfoTip } from '@/components/info-tip';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import { useQuerySuggestions } from '@/hooks/use-query-suggestions';
import {
  useAddRecentSearch,
  useDeleteRecentSearch,
  useRecentSearches,
} from '@/hooks/use-recent-searches';
import {
  type PaletteFacetGroup,
  useSearchPalette,
} from '@/hooks/use-search-palette';
import { $lastSearchQuery } from '@/stores/search-query';
import { cn } from '@/util/cn';

// A row in the dropdown: the user's own recent searches plus corpus-derived
// entity suggestions (real titles / channel names). `sectionLabel` is set on the
// first item of a section so the render can emit a heading above it.
type SearchItem = {
  value: string;
  label: string;
  // 'search' is the always-present primary action ("Search for <query>").
  // 'ai' is an LLM-generated, corpus-grounded query suggestion.
  kind: 'search' | 'ai' | 'recent' | 'title';
  sectionLabel?: string;
};

// A clickable facet row in the right column. `onClick` runs the search with this
// facet selected. Shares `value`/`label` with SearchItem so both can register as
// Autocomplete options (keyboard-navigable across both columns).
type FacetRow = {
  value: string;
  label: string;
  count: number;
  avatarUrl: string | null;
  onClick: () => void;
};

type PaletteItem = SearchItem | FacetRow;

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

// The `/search` param a facet row sets, by group kind. `value` is the param
// payload the server put on the row (channel slug / speaker / book / ref / year).
function facetSearchParam(
  kind: PaletteFacetGroup['kind'],
  value: string,
): Record<string, unknown> {
  switch (kind) {
    case 'channels':
      return { channelSlugs: [value] };
    case 'speakers':
      return { speakers: [value] };
    case 'scripture':
      return { bibleBooks: [value] };
    case 'verses':
      return { bibleRefs: [value] };
    case 'year':
      return { dateStart: `${value}-01-01`, dateEnd: `${value}-12-31` };
  }
}

export default function SearchBar({
  placeholder = 'Search or ask anything...',
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
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data: recentSearches = [] } = useRecentSearches();
  const { addSearch } = useAddRecentSearch();
  const deleteSearchMutation = useDeleteRecentSearch();

  // Track the live input text (uncontrolled input + listener) and whether the
  // user has the bar focused/open. The whole palette only appears once there's
  // typed text — no empty zero-state — so both columns and their fetches are
  // gated on `paletteActive`.
  // Seeded from the persisted last query so the bar isn't empty on non-search
  // pages (the header remounts per route); the /search URL still wins when present.
  const [inputValue, setInputValue] = useState(
    defaultValue ?? $lastSearchQuery.get(),
  );
  const [openIntent, setOpenIntent] = useState(false);
  const hasText = inputValue.trim().length > 0;
  const paletteActive = openIntent && hasText;

  // Keep the bar in sync across navigations (the header remounts per route). On
  // /search the URL query is the source of truth — mirror it into the store so the
  // bar shows the same query elsewhere (and clearing here clears it). Everywhere
  // else, seed the bar from the last search. Also closes the palette on navigation.
  useEffect(() => {
    if (isOnSearchPage) {
      $lastSearchQuery.set(defaultValue ?? '');
      setInputValue(defaultValue ?? '');
    } else {
      setInputValue($lastSearchQuery.get());
    }
    setOpenIntent(false);
  }, [defaultValue, isOnSearchPage]);

  // One query feeds the whole palette: titles (left) + facets (right).
  const palette = useSearchPalette(inputValue, paletteActive);
  const suggestions = palette.titles;
  const facets = palette;

  // Grounding for the AI suggestions: a compact slice of the facets already on
  // screen, so nano suggests queries the corpus can actually answer (no extra
  // OpenSearch round-trip — we reuse what the palette returned). Titles are
  // deliberately NOT fed in — they're shown verbatim in the Titles section below,
  // and feeding them just made nano echo them back as "suggestions".
  const facetLabels = (kind: PaletteFacetGroup['kind']) =>
    (facets.facetGroups.find((g) => g.kind === kind)?.rows ?? [])
      .slice(0, 5)
      .map((r) => r.label);
  const aiSuggestions = useQuerySuggestions(
    inputValue,
    {
      channels: facetLabels('channels'),
      speakers: facetLabels('speakers'),
      books: facetLabels('scripture'),
    },
    paletteActive,
  );

  // LEFT column — always leads with a primary "Search for <query>" action so the
  // column is never empty, then AI suggestions, the user's recent searches, and
  // corpus title matches. Filtering is done here (the Autocomplete runs in
  // `mode="none"`): recent searches are substring-filtered against the input;
  // titles arrive already prefix-matched. The literal query is dropped from every
  // group since the primary row already covers it; recent/title collisions are
  // also removed from the AI group so it never echoes them.
  const trimmedQuery = inputValue.trim();
  const lowerInput = trimmedQuery.toLowerCase();
  const searchItem: SearchItem = {
    value: trimmedQuery,
    label: trimmedQuery,
    kind: 'search',
  };
  const recentItems: SearchItem[] = recentSearches
    .map((s) => s.query)
    .filter(
      (q) =>
        lowerInput !== '' &&
        q.toLowerCase() !== lowerInput &&
        q.toLowerCase().includes(lowerInput),
    )
    .map((q) => ({ value: q, label: q, kind: 'recent' }));
  const recentSet = new Set(recentItems.map((r) => r.value.toLowerCase()));
  // Title suggestions only — channels/scripture/etc. are in the right facet column.
  const titleItems: SearchItem[] = suggestions
    .filter(
      (t) => t.toLowerCase() !== lowerInput && !recentSet.has(t.toLowerCase()),
    )
    .map((t) => ({ value: t, label: t, kind: 'title' as const }));
  const titleSet = new Set(titleItems.map((t) => t.value.toLowerCase()));
  // AI suggestions, minus anything already shown as the query, a recent, or a title.
  const aiItems: SearchItem[] = aiSuggestions
    .filter((s) => {
      const l = s.toLowerCase();
      return l !== lowerInput && !recentSet.has(l) && !titleSet.has(l);
    })
    .map((s) => ({ value: s, label: s, kind: 'ai' as const }));

  // Label recent/title only when 2+ groups are present — a lone group reads
  // cleaner without a heading (matches the prior history-only behavior). The AI
  // group is ALWAYS labeled, even alone: the "Suggestions" heading tells the user
  // these rows are AI-generated rather than typed/corpus matches.
  const namedGroupCount = [aiItems, recentItems, titleItems].filter(
    (g) => g.length > 0,
  ).length;
  const showLabels = namedGroupCount >= 2;
  const withLabel = (
    group: SearchItem[],
    label: string,
    always = false,
  ): SearchItem[] =>
    group.map((it, i) => ({
      ...it,
      sectionLabel: (always || showLabels) && i === 0 ? label : undefined,
    }));
  const items: SearchItem[] = [
    searchItem,
    ...withLabel(aiItems, 'Suggestions', true),
    ...withLabel(recentItems, 'Recent'),
    ...withLabel(titleItems, 'Titles'),
  ];

  // Execute the search with the typed query plus one facet pre-selected. Keeps the
  // bar's channel scope (if any), and records the query in recent searches.
  const goToSearch = (extra: Record<string, unknown>) => {
    const q = inputValue.trim();
    if (isLoggedIn && q) {
      addSearch(q);
    }
    navigate({
      to: '/search',
      search: {
        q: q || undefined,
        channelSlugs: channelSlug ? [channelSlug] : undefined,
        ...extra,
      },
    });
  };

  // RIGHT column — facet groups, already relevance-ordered by the server (rows
  // within each group and the groups themselves). We only attach the click
  // handler that runs the search with that facet selected.
  const facetGroups: Array<{ title: string; rows: FacetRow[] }> =
    facets.facetGroups.map((group) => ({
      title: group.title,
      rows: group.rows.map((row) => ({
        value: row.value,
        label: row.label,
        count: row.count,
        avatarUrl: row.avatarUrl,
        onClick: () => goToSearch(facetSearchParam(group.kind, row.value)),
      })),
    }));

  const hasFacets = facetGroups.length > 0;
  // Every rendered option (left suggestions + right facets) registered with the
  // Autocomplete so keyboard navigation spans both columns.
  const allItems: PaletteItem[] = [
    ...items,
    ...facetGroups.flatMap((g) => g.rows),
  ];
  // The popup is shown (controlled `open`) only when there's something to show,
  // so a query with no results never flashes an empty box.
  const isOpen = paletteActive && (items.length > 0 || hasFacets);
  const twoCol = items.length > 0 && hasFacets;

  // The enveloping panel renders inline (not in a dismiss-managing popup), so we
  // close it ourselves on an outside click. (Escape is handled on the form, and a
  // result click navigates away.) Closing on blur is intentionally avoided so
  // interacting inside the panel — e.g. the delete-recent button — doesn't dismiss
  // it mid-click.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      // The whole palette (input row + mobile in-flow suggestions) lives inside
      // wrapperRef, so a press anywhere inside it never dismisses.
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setOpenIntent(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen]);

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
    // The input is controlled by `inputValue` (seeded from the persisted last
    // query / the /search URL, kept in sync by the effect above), so it shows the
    // last search on every page rather than resetting when the header remounts.
    <div
      ref={wrapperRef}
      className={cn(
        'relative w-full',
        // Mobile: when open, the wrapper itself becomes the enveloping panel
        // (input row + results as one elevated surface), mirroring the desktop
        // pop-out. Stays in-flow — a fixed/absolute overlay here would be painted
        // under the page content (the header renders the bar inside an `isolate`).
        isOpen &&
          'max-sm:overflow-hidden max-sm:rounded-2xl max-sm:border max-sm:border-gray-950/10 max-sm:bg-white max-sm:shadow-xl max-sm:dark:border-white/10 max-sm:dark:bg-zinc-900',
        className,
      )}
    >
      <Autocomplete.Root
        value={inputValue}
        items={allItems}
        // We filter/merge recent + suggestions ourselves, so disable the built-in
        // list filtering and inline autocompletion.
        mode="none"
        itemToStringValue={(item: PaletteItem) => item.value}
        open={isOpen}
        onValueChange={(value) => setInputValue(value)}
        // Only honor "open" from Base UI (focus/typing). Closing is driven by our
        // outside-click / Escape / navigation handlers — otherwise Base UI's
        // close-on-blur fires when a tap moves focus to a (mobile) suggestion
        // button, unmounting it before the click lands.
        onOpenChange={(nextOpen) => {
          if (nextOpen) setOpenIntent(true);
        }}
      >
        <div className="flex w-full items-center gap-1.5">
          {/* Reserves the bar's footprint in the header flow while the palette is
            popped out to an absolute panel (desktop only). */}
          {isOpen ? (
            <div aria-hidden className="hidden h-10 min-w-0 flex-1 sm:block" />
          ) : null}

          {/* The palette: a pill bar that, on desktop, envelopes into a single
            panel holding the input AND the results when open. The input stays
            mounted across the morph, so focus and value are preserved. */}
          <div
            className={cn(
              'min-w-0 flex-1',
              isOpen &&
                'sm:absolute sm:top-0 sm:left-0 sm:z-50 sm:flex sm:w-[680px] sm:max-w-[calc(100vw-2rem)] sm:flex-col sm:overflow-hidden sm:rounded-2xl sm:border sm:border-gray-950/10 sm:bg-white/90 sm:shadow-xl sm:backdrop-blur-lg sm:dark:border-white/10 sm:dark:bg-black/90',
            )}
          >
            <form
              ref={formRef}
              onSubmit={handleSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpenIntent(false);
              }}
              className={cn(
                searchBarFormVariants({ variant }),
                'min-w-0',
                // When open, the input row sheds its pill chrome and becomes the
                // top row of the enveloping panel (the panel provides bg/border) —
                // on both desktop (pop-out) and mobile (in-flow). Background is
                // neutralized in every state AND in dark mode — the pill's
                // `dark:bg-white/10` would otherwise show as a separated light band
                // on the dark panel.
                isOpen &&
                  'rounded-none border-0 bg-transparent shadow-none backdrop-blur-none focus-within:bg-transparent focus-within:shadow-none hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent dark:focus-within:bg-transparent',
              )}
            >
              <div className="min-w-0 flex-1 px-1 pb-0.5">
                <Autocomplete.Input
                  name="q"
                  type="search"
                  placeholder={placeholder}
                  onFocus={() => setOpenIntent(true)}
                  className={cn(
                    searchBarInputVariants({ variant }),
                    // On the open panel the `light` variant's white text is
                    // invisible — force readable on-panel colors (desktop + mobile).
                    isOpen &&
                      'text-primary placeholder-gray-950/40 dark:placeholder-white/40',
                  )}
                />
              </div>
              <div className="flex shrink-0 items-center gap-0">
                <Autocomplete.Clear
                  onClick={handleClear}
                  className={cn(
                    searchBarButtonVariants({ variant, isActive: false }),
                    isOpen && 'text-primary hover:text-primary',
                  )}
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
                            isOpen && 'text-primary',
                          )}
                        />
                      </button>
                    )
                  }
                </Autocomplete.Value>
              </div>
            </form>

            {/* Results — desktop only, inside the enveloping panel. */}
            {isOpen ? (
              <div className="hidden border-gray-950/10 border-t sm:block dark:border-white/10">
                <Autocomplete.List className="flex max-h-[60vh]">
                  {/* LEFT — recent searches + corpus entity suggestions */}
                  {items.length > 0 ? (
                    <div
                      className={cn(
                        'overflow-y-auto py-2',
                        twoCol
                          ? 'w-1/2 border-gray-950/10 border-r dark:border-white/10'
                          : 'w-full',
                      )}
                    >
                      {items.map((item) => {
                        const Icon =
                          item.kind === 'recent'
                            ? IconHistory
                            : item.kind === 'ai'
                              ? IconSparkles
                              : IconSearch;
                        return (
                          <Fragment key={`${item.kind}:${item.value}`}>
                            {item.sectionLabel ? (
                              <div className="px-4 pt-2 pb-1 font-medium text-primary/40 text-xs uppercase tracking-wide">
                                {item.sectionLabel}
                              </div>
                            ) : null}
                            <Autocomplete.Item
                              value={item}
                              onClick={() => handleItemClick(item.value)}
                              className="cursor-pointer px-4 py-2.5 text-primary/80 text-sm outline-none transition-colors hover:bg-gray-950/5 hover:text-primary data-highlighted:bg-gray-950/5 data-highlighted:text-primary dark:data-highlighted:bg-white/10 dark:hover:bg-white/10"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <Icon
                                    size={16}
                                    className="shrink-0 text-primary opacity-50"
                                  />
                                  {item.kind === 'search' ? (
                                    <span className="truncate">
                                      Search for{' '}
                                      <span className="font-medium text-primary">
                                        “{item.label}”
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="truncate">
                                      {item.label}
                                    </span>
                                  )}
                                </div>
                                {item.kind === 'recent' && isLoggedIn ? (
                                  <button
                                    type="button"
                                    onClick={(e) =>
                                      handleDeleteSearch(e, item.value)
                                    }
                                    className="flex size-6 items-center justify-center text-primary/30 transition-colors hover:text-primary/60"
                                    aria-label={`Remove ${item.value}`}
                                  >
                                    <IconX size={14} />
                                  </button>
                                ) : null}
                              </div>
                            </Autocomplete.Item>
                          </Fragment>
                        );
                      })}
                    </div>
                  ) : null}

                  {/* RIGHT — facets; clicking one runs the search with it selected */}
                  {hasFacets ? (
                    <div
                      className={cn(
                        'overflow-y-auto py-2',
                        twoCol ? 'w-1/2' : 'w-full',
                      )}
                    >
                      {facetGroups.map((group) => (
                        <Autocomplete.Group key={group.title} className="mb-1">
                          <Autocomplete.GroupLabel className="px-4 pt-2 pb-1 font-medium text-primary/40 text-xs uppercase tracking-wide">
                            {group.title}
                          </Autocomplete.GroupLabel>
                          {group.rows.map((row) => (
                            <Autocomplete.Item
                              key={row.value}
                              value={row}
                              onClick={row.onClick}
                              className="flex cursor-pointer items-center justify-between gap-3 px-4 py-1.5 text-primary/80 text-sm outline-none transition-colors hover:bg-gray-950/5 hover:text-primary data-highlighted:bg-gray-950/5 data-highlighted:text-primary dark:data-highlighted:bg-white/10 dark:hover:bg-white/10"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                {row.avatarUrl ? (
                                  <img
                                    src={row.avatarUrl}
                                    alt=""
                                    className="size-5 shrink-0 rounded-full object-cover"
                                  />
                                ) : null}
                                <span className="truncate">{row.label}</span>
                              </span>
                              <span className="shrink-0 text-primary/40 text-xs tabular-nums">
                                {row.count}
                              </span>
                            </Autocomplete.Item>
                          ))}
                        </Autocomplete.Group>
                      ))}
                    </div>
                  ) : null}
                </Autocomplete.List>
              </div>
            ) : null}
          </div>

          {/* The help tip tucks away while the palette is open. */}
          {isOpen ? null : (
            <InfoTip
              content={SEARCH_HELP}
              label="How search works"
              className={variant === 'light' ? 'text-white' : undefined}
            />
          )}
        </div>
      </Autocomplete.Root>

      {/* Mobile palette — same suggestions + facets as the desktop panel. It's a
          continuation of the enveloping wrapper panel (its chrome lives on
          wrapperRef): just a divider under the input row, no card of its own.
          Rendered OUTSIDE Autocomplete.Root so the combobox's pointer handling
          can't swallow taps, and inside wrapperRef so the outside-click dismiss
          ignores taps in it. */}
      {isOpen ? (
        <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto overscroll-contain border-gray-950/10 border-t py-2 sm:hidden dark:border-white/10">
          {items.map((item) => {
            const Icon =
              item.kind === 'recent'
                ? IconHistory
                : item.kind === 'ai'
                  ? IconSparkles
                  : IconSearch;
            return (
              <Fragment key={`m:${item.kind}:${item.value}`}>
                {item.sectionLabel ? (
                  <div className="px-4 pt-2 pb-1 font-medium text-primary/40 text-xs uppercase tracking-wide">
                    {item.sectionLabel}
                  </div>
                ) : null}
                <div className="flex items-center gap-2 px-4">
                  <button
                    type="button"
                    onClick={() => handleItemClick(item.value)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left text-primary/90 text-sm"
                  >
                    <Icon
                      size={18}
                      className="shrink-0 text-primary opacity-50"
                    />
                    {item.kind === 'search' ? (
                      <span className="truncate">
                        Search for{' '}
                        <span className="font-medium text-primary">
                          “{item.label}”
                        </span>
                      </span>
                    ) : (
                      <span className="truncate">{item.label}</span>
                    )}
                  </button>
                  {item.kind === 'recent' && isLoggedIn ? (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSearch(e, item.value)}
                      className="flex size-8 shrink-0 items-center justify-center text-primary/30"
                      aria-label={`Remove ${item.value}`}
                    >
                      <IconX size={18} />
                    </button>
                  ) : null}
                </div>
              </Fragment>
            );
          })}

          {hasFacets ? (
            <div className="mt-1 space-y-3 border-gray-950/10 border-t px-4 pt-3 pb-1 dark:border-white/10">
              {facetGroups.map((group) => (
                <div key={`m:${group.title}`}>
                  <div className="mb-1.5 font-medium text-primary/40 text-xs uppercase tracking-wide">
                    {group.title}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.rows.map((row) => (
                      <button
                        key={`m:${group.title}:${row.value}`}
                        type="button"
                        onClick={row.onClick}
                        className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-950/10 bg-gray-950/5 px-3 py-1.5 text-primary/90 text-sm dark:border-white/10 dark:bg-white/5"
                      >
                        {row.avatarUrl ? (
                          <img
                            src={row.avatarUrl}
                            alt=""
                            className="size-4 shrink-0 rounded-full object-cover"
                          />
                        ) : null}
                        <span className="whitespace-nowrap">{row.label}</span>
                        <span className="text-primary/40 text-xs tabular-nums">
                          {row.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
