import { useNavigate } from '@tanstack/react-router';

type RelatedSearchesProps = {
  searches: readonly string[];
};

/**
 * Nano-generated related searches / follow-up questions, shown as pills in the
 * search sidebar. Clicking a pill starts a fresh search for that query (filters
 * reset), the same as typing it into the search bar.
 */
export function RelatedSearches({ searches }: RelatedSearchesProps) {
  const navigate = useNavigate();

  if (searches.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-primary text-sm">Related Searches</h2>
      <div className="flex flex-wrap gap-2">
        {searches.map((search) => (
          <button
            key={search}
            type="button"
            onClick={() => navigate({ to: '/search', search: { q: search } })}
            // Compact like the answer dialog's source chips (rounded-full,
            // text-xs) with the fancy border, on the same zinc surface as the
            // facet cards so it reads well in light and dark mode.
            className="inline-flex cursor-pointer items-center rounded-full border-fancy-pants bg-zinc-100 px-3 py-1 text-left font-medium text-primary/80 text-xs transition-colors hover:bg-zinc-200 hover:text-primary dark:bg-zinc-900 dark:text-primary/90 dark:hover:bg-zinc-800"
          >
            {search}
          </button>
        ))}
      </div>
    </div>
  );
}
