import { createMiddleware, createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getSession } from '@/util/auth';

const clientEnv = z
  .object({ TURNSTILE_SITE_KEY: z.string() })
  .parse(process.env);

export const getClientEnv = createServerFn({
  method: 'GET',
  response: 'data',
}).handler(() => clientEnv);

export const hasValidSession = createServerFn({
  method: 'GET',
  response: 'data',
}).handler(async (): Promise<boolean> => {
  const session = await getSession();

  return Boolean(session);
});

export const requireAnonMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next }) => {
  if (await hasValidSession()) {
    throw new Response('Unauthorized', { status: 401 });
  }

  return next();
});

export const requireAuthMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next }) => {
  if (!(await hasValidSession())) {
    throw new Response('Unauthorized', { status: 401 });
  }

  return next();
});
