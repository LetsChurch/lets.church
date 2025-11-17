import { logger as baseLogger } from '@letschurch/util';
import { z } from 'zod';
import { PrismaClient } from './generated/prisma/client';

const logger = baseLogger.child({
  package: '@letschurch/db',
});

// Re-export everything from the generated Prisma client
export * from './generated/prisma/client';

const { DATABASE_URL } = z
  .object({ DATABASE_URL: z.string() })
  .parse(process.env);

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const createPrismaClient = () => {
  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'info' },
      { emit: 'event', level: 'warn' },
    ],
    datasources: {
      db: {
        url: DATABASE_URL,
      },
    },
  });

  // Wire up Prisma logging to Pino
  client.$on(
    'query' as never,
    (e: { query: string; duration: number; params: string }) => {
      // TODO: consider debug level
      logger.info(
        { query: e.query, duration: e.duration, params: e.params },
        'prisma:query',
      );
    },
  );

  client.$on('info' as never, (e: { message: string }) => {
    logger.info({ message: e.message }, 'prisma:info');
  });

  client.$on('warn' as never, (e: { message: string }) => {
    logger.warn({ message: e.message }, 'prisma:warn');
  });

  client.$on('error' as never, (e: { message: string }) => {
    logger.error({ message: e.message }, 'prisma:error');
  });

  return client;
};

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export function getLoglessClient() {
  return new PrismaClient({
    datasources: {
      db: {
        url: DATABASE_URL,
      },
    },
  });
}

/**
 * Transaction client type for use in Prisma transaction callbacks.
 *
 * This type represents the Prisma client available in transaction callbacks.
 * With the new prisma-client generator, we directly use PrismaClient as the type
 * since it properly includes all model accessors as getters.
 *
 * Related issues:
 * - https://github.com/prisma/prisma/issues/20738 - TransactionClient doesn't support extended clients
 * - https://github.com/prisma/prisma/issues/26841 - New prisma-client generator type checking failures
 */
export type TransactionClient = PrismaClient;

export function parseDatabaseEnv() {
  return z
    .object({
      DATABASE_URL: z.string(),
    })
    .parse(process.env);
}
