import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import logger from '@/util/logger';
import type { Context } from './context';

const moduleLogger = logger.child({
  module: 'trpc/trpc',
});

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;

export const publicProcedure = t.procedure;

export const anonProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.session) {
    moduleLogger.warn('anonProcedure: session found when none expected');
    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next({
    ctx: {
      ...ctx,
      session: null,
    },
  });
});

export const authProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    moduleLogger.warn('authProcedure: no session found');
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session, // Known non-null
    },
  });
});
