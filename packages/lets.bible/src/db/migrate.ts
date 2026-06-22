// Programmatic migration runner — closes the pool so the process exits cleanly
// (mirrors packages/db). Run via `pnpm --filter @letschurch/lets.bible db:migrate`.
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { z } from 'zod';
import { createPool } from './pool';

const { LETS_BIBLE_DATABASE_URL } = z
  .object({ LETS_BIBLE_DATABASE_URL: z.string() })
  .parse(process.env);

const pool = createPool(LETS_BIBLE_DATABASE_URL);
const db = drizzle(pool);

try {
  await migrate(db, {
    migrationsFolder: join(import.meta.dirname, '../../drizzle'),
    migrationsSchema: 'drizzle',
    migrationsTable: '__drizzle_migrations',
  });
  console.log('lets.bible migrations applied successfully.');
} finally {
  await pool.end();
}
