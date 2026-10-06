import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';

import logger from '@/util/logger';
import { getMaintenanceConfig } from '@/util/maintenance';
import { hasAcceptedParticipationAgreements } from '@/util/participation';
import { redactLogInput } from '@/util/redact-log-input';

import type { Context } from './context';
import { trpcFailureLogLevel } from './failure-log-level';

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
          input: redactLogInput(input),
        },
      },
      `tRPC ${type}: ${path}`,
    );

    const logFailure = (error: unknown) => {
      const durationMs = Date.now() - start;
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      const errorCode = error instanceof TRPCError ? error.code : undefined;
      const isRateLimit = errorCode === 'TOO_MANY_REQUESTS';
      const logContext = {
        appUserId,
        err: errorObj,
        context: {
          procedure: path,
          type,
          durationMs,
          errorName: errorObj.name,
          errorCode,
          retryAfter: isRateLimit
            ? ctx.resHeaders.get('Retry-After')
            : undefined,
          input: redactLogInput(input),
        },
      };

      // Expected abuse-control responses should remain visible without
      // flooding error monitoring during a traffic spike.
      if (isRateLimit) {
        moduleLogger.warn(logContext, `tRPC ${type} rate limited: ${path}`);
      } else if (trpcFailureLogLevel(error) === 'warn') {
        moduleLogger.warn(logContext, `tRPC ${type} rejected: ${path}`);
      } else {
        moduleLogger.error(logContext, `tRPC ${type} error: ${path}`);
      }
    };

    let result: Awaited<ReturnType<typeof next>>;
    try {
      result = await next();
    } catch (error) {
      logFailure(error);
      throw error;
    }

    // tRPC catches errors thrown further down the chain and returns them as a
    // failed result instead of rethrowing, so a failure must be read from
    // `result.ok`, not caught.
    if (!result.ok) {
      logFailure(result.error);
      return result;
    }

    moduleLogger.info(
      {
        appUserId,
        context: {
          procedure: path,
          type,
          durationMs: Date.now() - start,
          success: true,
        },
      },
      `tRPC ${type} completed: ${path}`,
    );

    return result;
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

export const PARTICIPATION_AGREEMENTS_REQUIRED =
  'Accept the Statement of Theology and site terms before participating.';

/**
 * Community participation requires both acknowledgments. Authentication and
 * account-only features (including donation history and recurring donation
 * management) deliberately use authProcedure instead.
 */
export const participationProcedure = authProcedure.use(({ ctx, next }) => {
  if (!hasAcceptedParticipationAgreements(ctx.session.appUser)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: PARTICIPATION_AGREEMENTS_REQUIRED,
    });
  }

  return next({ ctx });
});
