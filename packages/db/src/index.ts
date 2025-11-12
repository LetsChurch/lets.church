import { z } from 'zod';
import { PrismaClient } from './generated/prisma/client';

// Re-export everything from the generated Prisma client
export * from './generated/prisma/client';

const { DATABASE_URL } = z
  .object({ DATABASE_URL: z.string() })
  .parse(process.env);

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query', 'info'],
    datasources: {
      db: {
        url: DATABASE_URL,
      },
    },
  });

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
