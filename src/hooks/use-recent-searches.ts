import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/react';
import { useIsLoggedIn } from './use-is-logged-in';

export type RecentSearch = {
  query: string;
  searchedAt: Date;
};

/**
 * Hook to fetch recent searches for the current user
 */
export function useRecentSearches() {
  const trpc = useTRPC();
  const isLoggedIn = useIsLoggedIn();

  return useQuery({
    ...trpc.search.getRecentSearches.queryOptions(),
    enabled: isLoggedIn,
  });
}

/**
 * Hook to delete a recent search with optimistic updates
 */
export function useDeleteRecentSearch() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.search.deleteRecentSearch.mutationOptions({
      onMutate: async (variables) => {
        // Cancel outgoing refetches
        await queryClient.cancelQueries({
          queryKey: trpc.search.getRecentSearches.queryOptions().queryKey,
        });

        // Snapshot the previous value
        const previousSearches = queryClient.getQueryData<RecentSearch[]>(
          trpc.search.getRecentSearches.queryOptions().queryKey,
        );

        // Optimistically update to remove the search
        queryClient.setQueryData(
          trpc.search.getRecentSearches.queryOptions().queryKey,
          (old: RecentSearch[] = []) =>
            old.filter((s) => s.query !== variables.query),
        );

        return { previousSearches };
      },
      onError: (_err, _variables, context) => {
        // Rollback on error
        if (context?.previousSearches) {
          queryClient.setQueryData(
            trpc.search.getRecentSearches.queryOptions().queryKey,
            context.previousSearches,
          );
        }
      },
    }),
  );
}

/**
 * Hook to add a search to recent searches with optimistic updates
 */
export function useAddRecentSearch() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return {
    addSearch: (query: string) => {
      // Optimistically update the cache
      queryClient.setQueryData(
        trpc.search.getRecentSearches.queryOptions().queryKey,
        (oldData: RecentSearch[] = []) => {
          // Remove the query if it already exists
          const filtered = oldData.filter((s) => s.query !== query.trim());
          // Add to the front and keep only 10 items
          return [
            { query: query.trim(), searchedAt: new Date() },
            ...filtered,
          ].slice(0, 10);
        },
      );
    },
  };
}
