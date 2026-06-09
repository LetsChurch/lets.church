import { useNavigate, useSearch } from '@tanstack/react-router';

type SearchFilters = {
  sort?: 'relevance' | 'date-asc' | 'date-desc';
  dateRange?: 'all-time' | 'today' | 'this-week' | 'this-month' | 'this-year';
  // Custom inclusive publish-date bounds (YYYY-MM-DD). When either is set it
  // takes precedence over the coarse `dateRange` bucket.
  dateStart?: string;
  dateEnd?: string;
  channelSlugs?: string[];
  // OSIS verse facet tokens ("John.3.16"). OR semantics across the list.
  bibleRefs?: string[];
  // OSIS book ids ("Rom") from the Bible-book facet. OR semantics.
  bibleBooks?: string[];
};

export function useSearchFilters() {
  const navigate = useNavigate({ from: '/search' });
  const searchParams = useSearch({ strict: false }) as SearchFilters;

  const filters = {
    sort: searchParams.sort,
    dateRange: searchParams.dateRange,
    dateStart: searchParams.dateStart,
    dateEnd: searchParams.dateEnd,
    channelSlugs: searchParams.channelSlugs,
    bibleRefs: searchParams.bibleRefs,
    bibleBooks: searchParams.bibleBooks,
  };

  const hasCustomDates = Boolean(filters.dateStart || filters.dateEnd);

  // Check if any filters are active (non-default values)
  const hasActiveFilters =
    (filters.sort && filters.sort !== 'relevance') ||
    (filters.dateRange && filters.dateRange !== 'all-time') ||
    hasCustomDates ||
    (filters.channelSlugs && filters.channelSlugs.length > 0) ||
    (filters.bibleRefs && filters.bibleRefs.length > 0) ||
    (filters.bibleBooks && filters.bibleBooks.length > 0);

  const setSort = (
    sort: 'relevance' | 'date-asc' | 'date-desc' | undefined,
  ) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, sort }),
    });
  };

  // Selecting a coarse bucket clears any custom range (they're mutually
  // exclusive in the UI; explicit bounds otherwise win server-side).
  const setDateRange = (
    dateRange:
      | 'all-time'
      | 'today'
      | 'this-week'
      | 'this-month'
      | 'this-year'
      | undefined,
  ) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        dateRange,
        dateStart: undefined,
        dateEnd: undefined,
      }),
    });
  };

  // Setting a custom range clears the coarse bucket.
  const setCustomDates = (
    dateStart: string | undefined,
    dateEnd: string | undefined,
  ) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        dateRange: undefined,
        dateStart: dateStart || undefined,
        dateEnd: dateEnd || undefined,
      }),
    });
  };

  const setChannelSlugs = (channelSlugs: string[] | undefined) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, channelSlugs }),
    });
  };

  const removeChannelSlug = (slugToRemove: string) => {
    const currentSlugs = filters.channelSlugs || [];
    const newSlugs = currentSlugs.filter((slug) => slug !== slugToRemove);
    setChannelSlugs(newSlugs.length > 0 ? newSlugs : undefined);
  };

  const setBibleRefs = (bibleRefs: string[] | undefined) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, bibleRefs }),
    });
  };

  const setBibleBooks = (bibleBooks: string[] | undefined) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, bibleBooks }),
    });
  };

  const clearFilters = () => {
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        sort: undefined,
        dateRange: undefined,
        dateStart: undefined,
        dateEnd: undefined,
        channelSlugs: undefined,
        bibleRefs: undefined,
        bibleBooks: undefined,
      }),
    });
  };

  return {
    filters,
    hasCustomDates,
    setSort,
    setDateRange,
    setCustomDates,
    setChannelSlugs,
    removeChannelSlug,
    setBibleRefs,
    setBibleBooks,
    clearFilters,
    hasActiveFilters,
  };
}
