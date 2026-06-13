import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDebounce } from 'use-debounce';
import { useTRPC } from '@/trpc/react';

export type PaletteSuggestions = {
  /** Left-column title suggestions. */
  titles: string[];
  /** Right-column facets. */
  channels: Array<{
    slug: string;
    name: string;
    count: number;
    avatarUrl: string | null;
  }>;
  speakers: Array<{ name: string; count: number }>;
  books: Array<{ book: string; label: string; count: number }>;
  verses: Array<{ ref: string; label: string; count: number }>;
  years: Array<{ year: string; count: number }>;
};

const EMPTY: PaletteSuggestions = {
  titles: [],
  channels: [],
  speakers: [],
  books: [],
  verses: [],
  years: [],
};

/**
 * Debounced data for the whole search-bar command palette — title suggestions
 * (left) and facets (right) — from a single `search.suggest` call (one OpenSearch
 * query + one channel-hydration read). Fires only while the palette is open and
 * the query is non-empty; `keepPreviousData` keeps the list visible between
 * keystrokes so it doesn't flicker.
 */
export function useSearchPalette(
  query: string,
  enabled: boolean,
): PaletteSuggestions {
  const trpc = useTRPC();
  const [debounced] = useDebounce(query.trim(), 150);

  const { data } = useQuery({
    ...trpc.search.suggest.queryOptions({ q: debounced }),
    enabled: enabled && debounced.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  return data ?? EMPTY;
}
