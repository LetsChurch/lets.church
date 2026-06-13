import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDebounce } from 'use-debounce';
import { useTRPC } from '@/trpc/react';

/**
 * A facet group, fully ordered server-side (rows within the group and the groups
 * themselves). `value` is the param payload the client feeds back into the search;
 * `kind` selects which `/search` param to set. The client renders these as-is.
 */
export type PaletteFacetGroup = {
  kind: 'channels' | 'speakers' | 'scripture' | 'verses' | 'year';
  title: string;
  rows: Array<{
    value: string;
    label: string;
    count: number;
    avatarUrl: string | null;
  }>;
};

export type PaletteSuggestions = {
  /** Left-column title suggestions. */
  titles: string[];
  /** Right-column facet groups, already relevance-ordered. */
  facetGroups: PaletteFacetGroup[];
};

const EMPTY: PaletteSuggestions = {
  titles: [],
  facetGroups: [],
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
