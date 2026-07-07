import { drizzle } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { createPool } from './pool';
import * as schema from './schema';

export * from './schema';

const { LETS_BIBLE_DATABASE_URL } = z
  .object({ LETS_BIBLE_DATABASE_URL: z.string() })
  .parse(process.env);

const pool = createPool(LETS_BIBLE_DATABASE_URL);

export const db = drizzle(pool, {
  schema,
  // On for dev SSR (helpful), off in production. LETS_BIBLE_DB_LOG explicitly
  // overrides either way: the seed scripts set it to "0" because Drizzle's
  // logger serializes and synchronously writes every statement (including all
  // bound params) to stdout — and the whole-Bible source-token seed inserts
  // 1000 rows per INSERT, so those per-chunk log lines dominate wall-clock time.
  logger: process.env.LETS_BIBLE_DB_LOG
    ? process.env.LETS_BIBLE_DB_LOG === '1'
    : process.env.NODE_ENV !== 'production',
});
