import { logger as baseLogger } from '@letschurch/util';
import { drizzle } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { createPool } from './pool';
import * as schema from './schema';

export * from './schema';

const logger = baseLogger.child({
  package: '@letschurch/db',
});

const { DATABASE_URL } = z
  .object({ DATABASE_URL: z.string() })
  .parse(process.env);

const pool = createPool(DATABASE_URL);

pool.on('error', (err) => {
  logger.error({ err }, 'pg pool error');
});

export const db = drizzle(pool, {
  schema,
  // On for dev SSR (helpful), off in production. DB_LOG explicitly overrides
  // either way: the seed/backfill scripts set it to "0" because Drizzle's
  // logger serializes and synchronously writes every statement (including all
  // bound params) to stdout, which dominates wall-clock time on bulk inserts.
  logger: process.env.DB_LOG
    ? process.env.DB_LOG === '1'
    : process.env.NODE_ENV !== 'production',
});

export type TransactionClient = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export function parseDatabaseEnv() {
  return z.object({ DATABASE_URL: z.string() }).parse(process.env);
}
