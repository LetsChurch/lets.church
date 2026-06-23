import { Autocomplete } from '@base-ui/react/autocomplete';
import { Menu } from '@base-ui/react/menu';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useRef, useState } from 'react';
import { BookJump, type BookJumpModel } from './book-jump';

// A single autocomplete entry. Entries are grouped into labeled sections by
// `group` (Jump to / Exact phrase / Verses / Topics & recent / Search), and the
// icon is derived from `kind`. `label` doubles as Base UI's string value.
export type Suggestion = {
  id?: string;
  kind?:
    | 'reference'
    | 'book'
    | 'verse'
    | 'exact'
    | 'topic'
    | 'recent'
    | 'search';
  group?: 'jump' | 'exact' | 'verses' | 'topics' | 'recent' | 'search';
  label: string;
  detail?: string; // dim inline subtype (chapter / verse / book / topic / recent)
  meta?: string; // right-aligned text (reference / "in N verses" / All results)
  badge?: string; // pill, e.g. "Exact"
  // Navigable kinds carry a passage target; search/exact/topic carry a query.
  book?: string | null;
  chapter?: number | null;
  verse?: number | null;
  q?: string;
};

// A search scope (translation) for the "WEB ▾"-style dropdown in the bar.
export type Scope = { id: string; label: string };

type Group = { value: string; items: Suggestion[] };

// Sections in display order; topics + recent share one section per the design.
const SECTIONS: {
  label: string;
  groups: NonNullable<Suggestion['group']>[];
}[] = [
  { label: 'Jump to', groups: ['jump'] },
  { label: 'Exact phrase', groups: ['exact'] },
  { label: 'Verses', groups: ['verses'] },
  { label: 'Topics & recent', groups: ['topics', 'recent'] },
  { label: '', groups: ['search'] }, // catch-all, no header
];

function buildGroups(items: Suggestion[]): Group[] {
  const out: Group[] = [];
  for (const section of SECTIONS) {
    const groupItems = items.filter(
      (s) => s.group && section.groups.includes(s.group),
    );
    if (groupItems.length) {
      out.push({ value: section.label, items: groupItems });
    }
  }
  return out;
}

function glyphFor(s: Suggestion): string {
  switch (s.kind) {
    case 'reference':
      return s.detail === 'verse' ? '⌖' : '↵';
    case 'book':
      return '☰';
    case 'exact':
      return '❝';
    case 'verse':
      return '“';
    case 'topic':
      return '#';
    case 'recent':
      return '↺';
    default:
      return '↵';
  }
}

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

export function SearchBox({
  suggestions,
  bookJump,
  chips,
  size = 'lg',
  query: controlledQuery,
  onQueryChange,
  scope,
  scopes,
  onScopeChange,
  onInputFocus,
}: {
  suggestions: Suggestion[];
  // The interactive book-jump widget, shown atop the dropdown when the query
  // looks like a book/reference (e.g. "john", "john 3:16").
  bookJump?: BookJumpModel | null;
  chips: string[];
  size?: 'lg' | 'md';
  // Controlled query (for live, server-driven suggestions). When omitted the
  // box manages its own query and filters the static `suggestions` itself
  // (used by Storybook + any static usage).
  query?: string;
  onQueryChange?: (q: string) => void;
  // Optional search-scope (translation) selector shown in the bar.
  scope?: Scope;
  scopes?: Scope[];
  onScopeChange?: (id: string) => void;
  // Called when the input gains focus (used to prefetch the search index).
  onInputFocus?: () => void;
}) {
  const navigate = useNavigate();
  const [internalQuery, setInternalQuery] = useState('');
  const [open, setOpen] = useState(false);
  // The dropdown anchors to the whole bar (not the inner input) so it matches
  // the bar's width and left edge, reading as one continuous control.
  const barRef = useRef<HTMLDivElement>(null);
  const live = onQueryChange != null;
  const query = controlledQuery ?? internalQuery;
  const setQuery = onQueryChange ?? setInternalQuery;
  const lg = size === 'lg';
  const groups = buildGroups(suggestions);
  // Only "connect" (flatten the bar's bottom + drop the gap) when the popup is
  // actually showing content — otherwise an open-but-empty box looks broken.
  const connected = open && (groups.length > 0 || !!bookJump);

  function searchEverything(value: string) {
    const v = value.trim();
    if (v) {
      navigate({
        to: '/search',
        search: scope ? { q: v, translation: scope.id } : { q: v },
      });
    }
  }

  function openPassage(slug: string, chapter: number, verse?: number) {
    navigate({
      to: '/bible/$book/$chapter',
      params: { book: slug, chapter: String(chapter) },
      search: verse != null ? { v: verse } : {},
      // A verse target is scrolled to + flashed in the reader, so opt out of the
      // router's scroll-to-top reset (matches passageLink/chapterLink).
      resetScroll: verse == null,
    });
  }

  // Book-jump widget: clicking a chapter fills the input (keeps drilling in).
  function fillQuery(text: string) {
    setQuery(text);
    setOpen(true);
  }

  function go(s: Suggestion) {
    if (s.book && s.chapter != null) {
      navigate({
        to: '/bible/$book/$chapter',
        params: { book: s.book, chapter: String(s.chapter) },
        search: s.verse != null ? { v: s.verse } : {},
        // A verse target (`?v=`) is scrolled to + flashed in the reader, so opt
        // out of the router's scroll-to-top reset (matches passageLink/chapterLink).
        resetScroll: s.verse == null,
      });
      return;
    }
    searchEverything(s.q ?? s.label);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // With a book match, Enter goes to the most specific target typed
    // (verse → chapter → whole book); otherwise search everything.
    if (bookJump) {
      const { book, chapter, verse } = bookJump;
      if (chapter != null && verse != null) {
        openPassage(book.slug, chapter, verse);
      } else if (chapter != null) {
        openPassage(book.slug, chapter);
      } else {
        openPassage(book.slug, 1);
      }
      return;
    }
    searchEverything(query);
  }

  return (
    <Autocomplete.Root
      items={groups}
      value={query}
      onValueChange={setQuery}
      open={open}
      onOpenChange={setOpen}
      // Live mode: items are already filtered by the server, so don't re-filter.
      mode={live ? 'none' : 'list'}
      itemToStringValue={(s: Suggestion) => s.label}
    >
      <form onSubmit={onSubmit} className="relative z-10 text-left">
        <div
          ref={barRef}
          className={`flex items-center gap-3 border border-line-strong bg-paper-raised pr-[10px] pl-[18px] shadow-sm transition focus-within:border-line-strong focus-within:shadow-[0_0_0_3px_rgba(154,123,63,0.14)] ${
            lg ? 'h-14' : 'h-13'
          } ${connected ? 'rounded-t-2xl rounded-b-none' : 'rounded-2xl'}`}
        >
          <span className="flex flex-shrink-0 text-gold">
            <SearchIcon size={lg ? 19 : 17} />
          </span>
          <Autocomplete.Input
            placeholder="Search a reference, phrase, topic, or idea…"
            onFocus={onInputFocus}
            className="min-w-0 flex-1 border-none bg-transparent text-[16.5px] text-ink outline-none placeholder:text-faint-2"
          />
          {scope && scopes && scopes.length > 1 && onScopeChange ? (
            <Menu.Root>
              <Menu.Trigger className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-line-strong bg-paper px-2 py-[5px] font-semibold text-[12px] text-muted outline-none hover:bg-paper-soft focus-visible:ring-2 focus-visible:ring-gold/40">
                {scope.label}
                <span className="text-[9px] text-faint">▾</span>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner sideOffset={6} align="end" className="z-50">
                  <Menu.Popup className="min-w-[160px] rounded-xl border border-line-strong bg-paper-raised p-1 shadow-[0_26px_50px_-28px_rgba(40,34,18,0.45)]">
                    {scopes.map((sc) => (
                      <Menu.Item
                        key={sc.id}
                        onClick={() => onScopeChange(sc.id)}
                        className={`cursor-pointer rounded-md px-3 py-1.5 text-[13px] outline-none data-highlighted:bg-paper-soft ${
                          sc.id === scope.id
                            ? 'font-semibold text-gold'
                            : 'text-ink'
                        }`}
                      >
                        {sc.label}
                      </Menu.Item>
                    ))}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          ) : (
            <span className="hidden flex-shrink-0 rounded-md border border-line-strong px-[7px] py-[3px] font-mono text-[11px] text-faint-2 sm:flex">
              ⌘K
            </span>
          )}
        </div>
      </form>

      <Autocomplete.Portal>
        <Autocomplete.Positioner
          // Anchor to the whole bar and sit flush against it (no gap) so the
          // dropdown reads as a continuation of the search field, matching the
          // design's connected input → menu (top corners square, no top border).
          anchor={barRef}
          sideOffset={0}
          className="z-20 w-(--anchor-width) data-empty:hidden"
        >
          <Autocomplete.Popup className="max-h-[min(70vh,520px)] overflow-y-auto rounded-t-none rounded-b-2xl border border-line-strong border-t-0 bg-paper-raised shadow-[0_24px_48px_-30px_rgba(40,34,18,0.4)]">
            {bookJump ? (
              <BookJump
                key={bookJump.book.slug}
                model={bookJump}
                onFill={fillQuery}
                onNavigate={openPassage}
              />
            ) : null}
            <Autocomplete.Empty className="px-4 py-3 text-[13px] text-muted-2 empty:m-0 empty:p-0">
              No matches — press Enter to search anyway.
            </Autocomplete.Empty>
            <Autocomplete.List>
              {(group: Group) => (
                <Autocomplete.Group
                  key={group.value || 'search'}
                  items={group.items}
                  className="border-line border-b last:border-b-0"
                >
                  {group.value ? (
                    <Autocomplete.GroupLabel className="px-4 pt-3 pb-1 font-bold text-[10.5px] text-faint uppercase tracking-[0.1em]">
                      {group.value}
                    </Autocomplete.GroupLabel>
                  ) : null}
                  <Autocomplete.Collection>
                    {(s: Suggestion) => (
                      <Autocomplete.Item
                        key={s.id ?? s.label}
                        value={s}
                        onClick={() => go(s)}
                        className="flex cursor-pointer items-center gap-3 px-4 py-[10px] data-highlighted:bg-paper-soft"
                      >
                        <span className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[7px] bg-paper text-[12px] text-muted-2">
                          {glyphFor(s)}
                        </span>
                        <span className="line-clamp-1 min-w-0 flex-1 text-[15px] text-ink">
                          {s.label}
                          {s.detail ? (
                            <span className="text-[13px] text-faint">
                              {' · '}
                              {s.detail}
                            </span>
                          ) : null}
                        </span>
                        {s.badge ? (
                          <span className="flex-shrink-0 rounded-full border border-gold-soft/40 bg-gold/[0.08] px-[9px] py-[2px] font-semibold text-[11px] text-gold">
                            <span className="mr-1 inline-block h-[5px] w-[5px] rounded-full bg-gold align-middle" />
                            {s.badge}
                          </span>
                        ) : s.meta ? (
                          <span className="flex-shrink-0 whitespace-nowrap text-[11.5px] text-faint-2">
                            {s.meta}
                          </span>
                        ) : null}
                      </Autocomplete.Item>
                    )}
                  </Autocomplete.Collection>
                </Autocomplete.Group>
              )}
            </Autocomplete.List>
            <div className="border-line border-t bg-paper-soft px-4 py-3 text-[12px] text-muted-2">
              <div>
                Press{' '}
                <span className="rounded border border-line-strong bg-paper-raised px-[5px] py-px font-mono text-[11px]">
                  Enter
                </span>{' '}
                to search everything — exact text, cross-references, and related
                passages, each labeled.
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-faint">
                <span aria-hidden="true" className="text-gold">
                  ✦
                </span>
                AI-assisted answers coming to results.
              </div>
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
