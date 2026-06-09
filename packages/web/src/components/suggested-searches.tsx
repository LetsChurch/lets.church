import { IconSparkles } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';

type SuggestedSearchesProps = {
  searches: readonly string[];
  /** Show placeholder pills while the (separately-fetched) metadata loads. */
  loading?: boolean;
};

// Varied widths so the loading pills read as text of different lengths.
const SKELETON_WIDTHS = ['w-28', 'w-40', 'w-24', 'w-36', 'w-32'];

/**
 * Nano-generated suggested searches / follow-up questions, shown as pills in the
 * search sidebar. Clicking a pill starts a fresh search for that query (filters
 * reset), the same as typing it into the search bar.
 */
export function SuggestedSearches({
  searches,
  loading = false,
}: SuggestedSearchesProps) {
  const navigate = useNavigate();

  // Render nothing only once we know there are no suggestions (not while loading).
  if (!loading && searches.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-1.5 font-semibold text-primary text-sm">
        <IconSparkles
          size={16}
          className="shrink-0 text-indigo-500 dark:text-indigo-300"
          aria-hidden="true"
        />
        Suggested Searches
      </h2>
      <div className="flex flex-wrap gap-2">
        {loading
          ? SKELETON_WIDTHS.map((w) => (
              <div
                key={w}
                className={`h-7 ${w} animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800`}
              />
            ))
          : searches.map((search) => (
              <button
                key={search}
                type="button"
                onClick={() =>
                  navigate({ to: '/search', search: { q: search } })
                }
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
