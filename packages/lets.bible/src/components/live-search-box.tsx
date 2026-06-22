import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTRPC } from '@/trpc/react';
import { SearchBox, type Suggestion } from './search-box';

// Wraps the presentational SearchBox with live, server-driven suggestions.
// While the input is empty it shows the static "try searching" examples; once
// the user types it shows typed suggestions (reference / book / verse / search)
// from `bible.suggest`. Kept separate from SearchBox so the latter stays
// tRPC-free (Storybook-renderable).
export function LiveSearchBox({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const trpc = useTRPC();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);

  const { data: examples } = useSuspenseQuery(
    trpc.home.searchSuggestions.queryOptions(),
  );
  const { data: live } = useQuery({
    ...trpc.bible.suggest.queryOptions({ q: debounced }),
    enabled: debounced.length > 0,
  });

  const suggestions: Suggestion[] = query.trim()
    ? (live?.suggestions ?? [])
    : examples.suggestions.map((s) => ({ ...s, kind: 'search' as const }));

  return (
    <SearchBox
      suggestions={suggestions}
      chips={examples.chips}
      size={size}
      query={query}
      onQueryChange={setQuery}
    />
  );
}
