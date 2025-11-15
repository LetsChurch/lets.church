import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { getSession } from '@/util/auth';

export async function createContext({
  req,
  resHeaders,
}: FetchCreateContextFnOptions) {
  const session = await getSession();

  return {
    session,
    req,
    resHeaders,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
