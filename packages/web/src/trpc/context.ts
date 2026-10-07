import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

import { getSession } from '@/util/auth';
import type { RateLimitSubject } from '@/util/rate-limit';

export async function createContext({
  req,
  resHeaders,
}: FetchCreateContextFnOptions) {
  const session = await getSession();
  const isSiteAdmin = session?.appUser?.role === 'ADMIN';

  return {
    session,
    req,
    resHeaders,
    isSiteAdmin,
    // Web requests are limited per IP. Callers that verify a finer-grained
    // client identity (the MCP endpoint's signed sessions) set this instead.
    rateLimitSubject: null as RateLimitSubject | null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
