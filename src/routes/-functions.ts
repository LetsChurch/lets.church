import { createMiddleware, createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getSession } from '@/util/auth';

export const sessionMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const session = await getSession();

    const safeSession = session
      ? {
          id: session.id,
          expiresAt: session.expiresAt,
          appUser: {
            id: session.appUser.id,
          },
        }
      : null;

    return next({
      context: {
        session: safeSession,
      },
    });
  },
);

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
})
  .middleware([sessionMiddleware])
  .handler(async ({ context }): Promise<boolean> => {
    return Boolean(context.session);
  });

export const requireAnonMiddleware = createMiddleware({
  type: 'function',
})
  .middleware([sessionMiddleware])
  .server(async ({ next, context }) => {
    if (context.session) {
      throw new Response('Unauthorized', { status: 401 });
    }

    return next();
  });

export const requireAuthMiddleware = createMiddleware({
  type: 'function',
})
  .middleware([sessionMiddleware])
  .server(async ({ next, context }) => {
    if (!context.session) {
      throw new Response('Unauthorized', { status: 401 });
    }

    return next();
  });
