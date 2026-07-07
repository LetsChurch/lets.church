import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

import { getSessionFromRequest } from '@/server/oidc';

export async function createContext({
  req,
  resHeaders,
}: FetchCreateContextFnOptions) {
  const session = await getSessionFromRequest(req);
  return { session, req, resHeaders };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
