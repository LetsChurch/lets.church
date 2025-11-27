import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import logger from '@/util/logger';
import type { Context } from './context';

const moduleLogger = logger.child({
  module: 'trpc/trpc',
});

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;

/**
 * Logging middleware for all tRPC procedures
 * Logs procedure calls, execution time, and errors
 */
const loggingMiddleware = t.middleware(
  async ({ path, type, next, ctx, input }) => {
    const start = Date.now();
    const appUserId = ctx.session?.appUserId;

    // Log procedure start
    moduleLogger.info(
      {
        appUserId,
        context: {
          procedure: path,
          type,
          input,
        },
      },
      `tRPC ${type}: ${path}`,
    );

    try {
      const result = await next();
      const durationMs = Date.now() - start;

      // Log successful completion
      moduleLogger.info(
        {
          appUserId,
          context: {
            procedure: path,
            type,
            durationMs,
            success: true,
          },
        },
        `tRPC ${type} completed: ${path}`,
      );

      return result;
    } catch (error) {
      const durationMs = Date.now() - start;
      const errorObj =
        error instanceof Error ? error : new Error(String(error));

      // Log error
      moduleLogger.error(
        {
          appUserId,
          err: errorObj,
          context: {
            procedure: path,
            type,
            durationMs,
            errorName: errorObj.name,
            input,
          },
        },
        `tRPC ${type} error: ${path}`,
      );

      throw error;
    }
  },
);

export const publicProcedure = t.procedure.use(loggingMiddleware);

export const anonProcedure = t.procedure
  .use(loggingMiddleware)
  .use(({ ctx, next }) => {
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

export const authProcedure = t.procedure
  .use(loggingMiddleware)
  .use(({ ctx, next }) => {
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
