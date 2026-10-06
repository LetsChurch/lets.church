import { TRPCError } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';

/**
 * Client errors (4xx: bad input, auth, not found, etc.) are routine and logged
 * as warnings; server errors and anything that isn't a TRPCError are logged as
 * errors so monitoring only pages on real failures.
 */
export function trpcFailureLogLevel(error: unknown): 'warn' | 'error' {
  if (!(error instanceof TRPCError)) return 'error';
  return getHTTPStatusCodeFromError(error) < 500 ? 'warn' : 'error';
}
