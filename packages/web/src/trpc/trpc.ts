import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import logger from '@/util/logger';
import { getMaintenanceConfig } from '@/util/maintenance';
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

// Procedures that must stay reachable while maintenance mode is on so that an
// admin can still log in and the maintenance page can render. Everything under
// the `auth.` router (login, etc.) is allowlisted by prefix below.
const MAINTENANCE_ALLOWLIST = new Set([
  'common.getMaintenanceStatus',
  'common.hasValidSession',
  'common.getCurrentUser',
  'common.getClientEnv',
]);

/**
 * Global maintenance gate. When maintenance mode is enabled, only site admins
 * may call tRPC procedures; everyone else gets SERVICE_UNAVAILABLE. A small
 * allowlist keeps the login flow and the maintenance page working.
 */
const maintenanceMiddleware = t.middleware(async ({ path, ctx, next }) => {
  if (
    ctx.isSiteAdmin ||
    MAINTENANCE_ALLOWLIST.has(path) ||
    path.startsWith('auth.')
  ) {
    return next();
  }

  const { maintenanceMode } = await getMaintenanceConfig();

  if (maintenanceMode) {
    moduleLogger.info(
      { context: { procedure: path } },
      'Blocked non-admin tRPC call during maintenance mode',
    );
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'The site is currently down for maintenance.',
    });
  }

  return next();
});

export const publicProcedure = t.procedure
  .use(loggingMiddleware)
  .use(maintenanceMiddleware);

export const anonProcedure = t.procedure
  .use(loggingMiddleware)
  .use(maintenanceMiddleware)
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
  .use(maintenanceMiddleware)
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
