import { useNavigate, useSearch } from '@tanstack/react-router';

type SearchFilters = {
  sort?: 'relevance' | 'date-asc' | 'date-desc';
  dateRange?: 'all-time' | 'today' | 'this-week' | 'this-month' | 'this-year';
  channelSlugs?: string[];
};

export function useSearchFilters() {
  const navigate = useNavigate({ from: '/search' });
  const searchParams = useSearch({ strict: false }) as SearchFilters;

  const filters = {
    sort: searchParams.sort,
    dateRange: searchParams.dateRange,
    channelSlugs: searchParams.channelSlugs,
  };

  // Check if any filters are active (non-default values)
  const hasActiveFilters =
    (filters.sort && filters.sort !== 'relevance') ||
    (filters.dateRange && filters.dateRange !== 'all-time') ||
    (filters.channelSlugs && filters.channelSlugs.length > 0);

  const setSort = (
    sort: 'relevance' | 'date-asc' | 'date-desc' | undefined,
  ) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, sort }),
    });
  };

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
      search: (prev: Record<string, unknown>) => ({ ...prev, dateRange }),
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

  const clearFilters = () => {
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        sort: undefined,
        dateRange: undefined,
        channelSlugs: undefined,
      }),
    });
  };

  return {
    filters,
    setSort,
    setDateRange,
    setChannelSlugs,
    removeChannelSlug,
    clearFilters,
    hasActiveFilters,
  };
}
