import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useReducer, useState } from 'react';
import { matchBooks } from '@/lib/book-search';
import { bookBySlug, type CanonBook } from '@/lib/canon';
import { parseReference } from '@/lib/reference';
import { matchTopics } from '@/lib/topics';
import { useRecent } from '@/local/store';
import {
  countExactPhraseSync,
  getStructureSync,
  getVerseTextSync,
  prefetchStructure,
  prefetchTranslation,
  searchVersesSync,
  subscribeIndexReady,
} from '@/search/flex-client';
import { useTRPC } from '@/trpc/react';
import type { BookJumpModel } from './book-jump';
import { type Scope, SearchBox, type Suggestion } from './search-box';

// Resolve the active book-jump widget from the query: a full reference
// ("john 3:16") drives book→chapter→verse, a bare/partial book name ("joh")
// resolves to the best book match. Returns null when nothing looks like a book.
function deriveBookJump(query: string, scope: string): BookJumpModel | null {
  const q = query.trim();
  if (!q) {
    return null;
  }
  let book: CanonBook | undefined;
  let chapter: number | null = null;
  let verse: number | null = null;

  const ref = parseReference(q);
  if (ref) {
    book = bookBySlug(ref.book);
    chapter = ref.chapter;
    verse = ref.verse ?? null;
  } else {
    book = matchBooks(q, 1)[0];
  }
  if (!book) {
    return null;
  }

  const versesPerChapter = getStructureSync()?.[scope]?.[book.code] ?? [];
  const pickText =
    chapter != null && verse != null
      ? getVerseTextSync(scope, `${book.code}.${chapter}.${verse}`)
      : null;
  return { book, chapter, verse, versesPerChapter, pickText };
}

function buildSuggestions(
  query: string,
  scope: string | undefined,
  bookJump: BookJumpModel | null,
  recent: ReturnType<typeof useRecent>,
): Suggestion[] {
  const q = query.trim();
  if (!q) {
    // Empty input: offer recent chapters from local reading history.
    return recent.map((r) => ({
      id: `recent:${r.slug}.${r.chapter}`,
      kind: 'recent',
      group: 'recent',
      label: `${r.name} ${r.chapter}`,
      detail: 'recent',
      book: r.slug,
      chapter: r.chapter,
    }));
  }

  const out: Suggestion[] = [];

  // Verse full-text matches (skipped when the book widget is the focus).
  if (!bookJump && scope) {
    for (const v of searchVersesSync(scope, q, 4)) {
      out.push({
        id: v.id,
        kind: 'verse',
        group: 'verses',
        label: v.text,
        meta: `${v.name} ${v.chapter}:${v.verse}`,
        book: v.slug,
        chapter: v.chapter,
        verse: v.verse,
      });
    }
  }

  // Exact-phrase count (multi-word only).
  if (scope && q.split(/\s+/).filter(Boolean).length >= 2) {
    const count = countExactPhraseSync(scope, q);
    if (count > 0) {
      out.push({
        id: 'exact',
        kind: 'exact',
        group: 'exact',
        label: `“${q}”`,
        meta: `${count} ${count === 1 ? 'verse' : 'verses'}`,
        badge: 'Exact',
        q,
      });
    }
  }

  for (const t of matchTopics(q, 2)) {
    out.push({
      id: `topic:${t.id}`,
      kind: 'topic',
      group: 'topics',
      label: t.label,
      detail: 'topic',
      q: t.query,
    });
  }

  out.push({
    id: 'search',
    kind: 'search',
    group: 'search',
    label: `Search “${q}”`,
    meta: 'All results',
    q,
  });
  return out;
}

// Live search box backed entirely by the client-side FlexSearch indices — book
// jumps, verse matches, exact-phrase counts, topics and recent history are all
// computed locally, so the input needs no debounce. The verse index + structure
// are prefetched on focus (and when the scope changes). The results page still
// uses Elasticsearch (richer cross-refs / related passages); this powers the
// instant autocomplete only.
export function LiveSearchBox({
  size = 'lg',
  showChips = true,
  placeholder,
  context,
  initialQuery,
}: {
  size?: 'lg' | 'md' | 'sm';
  // The example chips below the bar — hidden in compact/chrome placements.
  showChips?: boolean;
  placeholder?: string;
  // The reader's current location. When provided, an empty/focused box opens
  // that book's chapter grid (with the current chapter highlighted) — so the
  // header search bar doubles as the book/chapter picker.
  context?: { book: string; chapter: number };
  // Pre-fill the box (e.g. the results page seeds it from the URL `?q=`).
  initialQuery?: string;
}) {
  const trpc = useTRPC();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const { data: examples } = useSuspenseQuery(
    trpc.home.searchSuggestions.queryOptions(),
  );
  const { data: translations } = useQuery(
    trpc.bible.translations.queryOptions(),
  );

  const [scopeId, setScopeId] = useState<string | undefined>(undefined);
  const defaultTranslation =
    translations?.find((t) => t.isDefault)?.id ?? translations?.[0]?.id;
  const selectedScope = scopeId ?? defaultTranslation;
  const scopes: Scope[] = (translations ?? []).map((t) => ({
    id: t.id,
    label: t.id,
  }));
  const scope: Scope | undefined = selectedScope
    ? { id: selectedScope, label: selectedScope }
    : undefined;

  // Load the text + structure for the active translation; re-render when the
  // arrays are ready (exact/reference search works immediately). The fuzzy index
  // builds in a worker afterwards — subscribeIndexReady re-renders again so
  // results upgrade from exact-only to fuzzy once it lands.
  useEffect(() => {
    prefetchStructure()
      .then(() => bump())
      .catch(() => {});
    if (selectedScope) {
      prefetchTranslation(selectedScope)
        .then(() => bump())
        .catch(() => {});
    }
    return subscribeIndexReady(() => bump());
  }, [selectedScope]);

  const recent = useRecent(2);
  // With a query, the book-jump widget follows what's typed. With an empty box
  // and a reader `context`, it opens that book's chapter grid (the picker) with
  // the current chapter marked — so clicking the header bar acts like the old
  // book/chapter picker.
  const contextBook = context ? bookBySlug(context.book) : undefined;
  let bookJump: BookJumpModel | null = null;
  if (selectedScope) {
    if (query.trim()) {
      bookJump = deriveBookJump(query, selectedScope);
    } else if (contextBook) {
      const base = deriveBookJump(contextBook.name, selectedScope);
      bookJump = base ? { ...base, activeChapter: context?.chapter } : null;
    }
  }
  const suggestions = buildSuggestions(query, selectedScope, bookJump, recent);

  return (
    <SearchBox
      suggestions={suggestions}
      bookJump={bookJump}
      chips={showChips ? examples.chips : []}
      size={size}
      placeholder={placeholder}
      query={query}
      onQueryChange={setQuery}
      scope={scope}
      scopes={scopes}
      onScopeChange={setScopeId}
      onInputFocus={() => {
        prefetchStructure()
          .then(() => bump())
          .catch(() => {});
        if (selectedScope) {
          prefetchTranslation(selectedScope)
            .then(() => bump())
            .catch(() => {});
        }
      }}
    />
  );
}
