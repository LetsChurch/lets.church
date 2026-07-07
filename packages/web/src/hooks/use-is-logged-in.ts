import { useSuspenseQuery } from '@tanstack/react-query';

import { useTRPC } from '@/trpc/react';

/**
 * Hook that returns whether the user is currently logged in.
 * Uses the session data cached in the root loader.
 */
export function useIsLoggedIn(): boolean {
  const trpc = useTRPC();

  const { data: isLoggedIn } = useSuspenseQuery(
    trpc.common.hasValidSession.queryOptions(),
  );

  return isLoggedIn;
}
