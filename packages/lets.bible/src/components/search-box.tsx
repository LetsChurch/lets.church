import { Autocomplete } from '@base-ui/react/autocomplete';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';

// A single autocomplete entry. The menu mixes KINDS (reference jump, book,
// verse match, catch-all search) — each rendered with its own icon + type
// label, matching the design. `label` doubles as Base UI's string value.
export type Suggestion = {
  id?: string;
  kind?: 'reference' | 'book' | 'verse' | 'search';
  icon: string;
  label: string;
  meta: string;
  // Navigable kinds (reference/book/verse) carry a passage target; the
  // catch-all `search` kind carries the raw query in `q`.
  book?: string | null;
  chapter?: number | null;
  verse?: number | null;
  q?: string;
};

function SearchIcon({ size = 19 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <title>Search</title>
      <circle cx="7" cy="7" r="5" />
      <line x1="11" y1="11" x2="14.5" y2="14.5" strokeLinecap="round" />
    </svg>
  );
}

const KIND_LABEL: Record<NonNullable<Suggestion['kind']>, string> = {
  reference: 'Go to',
  book: 'Book',
  verse: 'Verse',
  search: 'Search',
};

export function SearchBox({
  suggestions,
  chips,
  size = 'lg',
  query: controlledQuery,
  onQueryChange,
}: {
  suggestions: Suggestion[];
  chips: string[];
  size?: 'lg' | 'md';
  // Controlled query (for live, server-driven suggestions). When omitted the
  // box manages its own query and filters the static `suggestions` itself
  // (used by Storybook + any static usage).
  query?: string;
  onQueryChange?: (q: string) => void;
}) {
  const navigate = useNavigate();
  const [internalQuery, setInternalQuery] = useState('');
  const live = onQueryChange != null;
  const query = controlledQuery ?? internalQuery;
  const setQuery = onQueryChange ?? setInternalQuery;
  const lg = size === 'lg';

  function searchEverything(value: string) {
    const v = value.trim();
    if (v) {
      navigate({ to: '/search', search: { q: v } });
    }
  }

  function go(s: Suggestion) {
    if (s.book && s.chapter != null) {
      navigate({
        to: '/bible/$book/$chapter',
        params: { book: s.book, chapter: String(s.chapter) },
        search: s.verse != null ? { v: s.verse } : {},
        // A verse target (`?v=`) is scrolled to + flashed in the reader, so opt
        // out of the router's scroll-to-top reset (matches passageLink/chapterLink)
        // — otherwise the jump lands at the top instead of on the verse.
        resetScroll: s.verse == null,
      });
      return;
    }
    searchEverything(s.q ?? s.label);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    searchEverything(query);
  }

  return (
    <Autocomplete.Root
      items={suggestions}
      value={query}
      onValueChange={setQuery}
      // Live mode: items are already filtered by the server, so don't re-filter.
      mode={live ? 'none' : 'list'}
      itemToStringValue={(s: Suggestion) => s.label}
    >
      <form onSubmit={onSubmit} className="relative z-10 text-left">
        <div
          className={`flex items-center gap-3 rounded-2xl border border-line-strong bg-paper-raised pr-[10px] pl-[18px] shadow-sm transition focus-within:border-line-strong focus-within:shadow-[0_0_0_3px_rgba(154,123,63,0.14)] ${
            lg ? 'h-14' : 'h-13'
          }`}
        >
          <span className="flex flex-shrink-0 text-gold">
            <SearchIcon size={lg ? 19 : 17} />
          </span>
          <Autocomplete.Input
            placeholder="Search a reference, phrase, topic, or idea…"
            className="min-w-0 flex-1 border-none bg-transparent text-[16.5px] text-ink outline-none placeholder:text-faint-2"
          />
          <span className="hidden flex-shrink-0 rounded-md border border-line-strong px-[7px] py-[3px] font-mono text-[11px] text-faint-2 sm:flex">
            ⌘K
          </span>
        </div>
      </form>

      <Autocomplete.Portal>
        <Autocomplete.Positioner
          sideOffset={6}
          className="z-20 w-(--anchor-width) data-empty:hidden"
        >
          <Autocomplete.Popup className="overflow-hidden rounded-2xl border border-line-strong bg-paper-raised shadow-[0_26px_50px_-28px_rgba(40,34,18,0.45)]">
            <div className="px-4 pt-3 pb-[5px] font-bold text-[10.5px] text-faint uppercase tracking-[0.08em]">
              {query ? 'Suggestions' : 'Try searching'}
            </div>
            <Autocomplete.Empty className="px-4 py-3 text-[13px] text-muted-2 empty:m-0 empty:p-0">
              No matches — press Enter to search anyway.
            </Autocomplete.Empty>
            <Autocomplete.List className="pb-1">
              {(s: Suggestion) => (
                <Autocomplete.Item
                  key={s.id ?? s.label}
                  value={s}
                  onClick={() => go(s)}
                  className="flex cursor-pointer items-center gap-3 px-4 py-[10px] data-highlighted:bg-paper-soft"
                >
                  <span className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[7px] bg-paper text-[12px] text-muted-2">
                    {s.icon}
                  </span>
                  <span className="line-clamp-1 flex-1 text-[15px] text-ink">
                    {s.label}
                  </span>
                  <span className="whitespace-nowrap text-[11.5px] text-faint-2">
                    {s.meta || (s.kind ? KIND_LABEL[s.kind] : '')}
                  </span>
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
            <div className="border-line border-t bg-paper-soft px-4 py-3 text-[12px] text-muted-2">
              Press{' '}
              <span className="rounded border border-line-strong bg-paper-raised px-[5px] py-px font-mono text-[11px]">
                Enter
              </span>{' '}
              to search everything — exact text, cross-references, and related
              passages, each labeled.
            </div>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>

      <div className="mt-[18px] flex flex-wrap justify-center gap-2">
        {chips.map((c) => (
          <button
            type="button"
            key={c}
            onClick={() => searchEverything(c)}
            className="rounded-full border border-line bg-paper-soft px-[14px] py-[7px] text-[13px] text-muted"
          >
            {c}
          </button>
        ))}
      </div>
    </Autocomplete.Root>
  );
}
