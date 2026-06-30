import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDebounce } from 'use-debounce';
import { useTRPC } from '@/trpc/react';

/**
 * Compact corpus grounding for AI query suggestions, sliced from the palette
 * facets already on screen (so we don't re-query OpenSearch just to ground nano).
 */
export type QuerySuggestContext = {
  titles?: string[];
  channels?: string[];
  speakers?: string[];
  books?: string[];
};

/**
 * Debounced, grounded "Grok-style" query suggestions for the palette's left
 * column (gpt-5.4-nano via `search.suggestQueries`). Fired on the same 150ms
 * cadence as the palette but as a separate, non-blocking query so the OS
 * suggestions render instantly and these fill in a beat later. Only fires once
 * there's grounding context, so we never spend a nano call on a query the corpus
 * has nothing for. Best-effort: errors resolve to an empty list upstream.
 */
export function useQuerySuggestions(
  query: string,
  context: QuerySuggestContext,
  enabled: boolean,
): string[] {
  const trpc = useTRPC();
  const [debounced] = useDebounce(query.trim(), 150);

  const hasContext = Boolean(
    context.titles?.length ||
      context.channels?.length ||
      context.speakers?.length ||
      context.books?.length,
  );

  const { data } = useQuery({
    ...trpc.search.suggestQueries.queryOptions({ q: debounced, context }),
    enabled: enabled && debounced.length > 0 && hasContext,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  return data?.suggestions ?? [];
}
