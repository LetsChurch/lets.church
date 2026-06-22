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
  logger: process.env.NODE_ENV !== 'production',
});
