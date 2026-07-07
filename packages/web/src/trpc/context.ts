import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

import { getSession } from '@/util/auth';

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
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
