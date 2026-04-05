/**
 * Programmatic migration runner.
 *
 * Replaces `drizzle-kit migrate` in scripts so the pg pool is closed after
 * migrations apply and the process exits cleanly (drizzle-kit CLI hangs on
 * fresh databases because it never closes the pool).
 */

import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { z } from 'zod';

const { DATABASE_URL } = z
  .object({ DATABASE_URL: z.string() })
  .parse(process.env);

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

try {
  await migrate(db, {
    migrationsFolder: join(import.meta.dirname, '../drizzle'),
    migrationsSchema: 'drizzle',
    migrationsTable: '__drizzle_migrations',
  });
  console.log('Migrations applied successfully.');
} finally {
  await pool.end();
}
