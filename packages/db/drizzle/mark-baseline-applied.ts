/**
 * Marks the Drizzle baseline migration as already applied on databases that
 * were previously managed by Prisma (i.e. tables already exist).
 *
 * Safe to run unconditionally: it only inserts the baseline record when the
 * `_prisma_migrations` table exists (indicating an existing Prisma-managed DB).
 * On a brand-new database, it does nothing and lets `drizzle-kit migrate` run
 * the baseline SQL normally.
 *
 * Usage: DATABASE_URL=... tsx drizzle/mark-baseline-applied.ts
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { createPool } from '../src/pool';

const { DATABASE_URL } = z
  .object({ DATABASE_URL: z.string() })
  .parse(process.env);

const sql = readFileSync(join(import.meta.dirname, '0000_baseline.sql'), 'utf8');
const hash = createHash('sha256').update(sql).digest('hex');

const pool = createPool(DATABASE_URL);

try {
  // Only mark as applied if this is an existing Prisma-managed database.
  // On a fresh database, skip so drizzle-kit migrate creates all tables normally.
  const { rows: prismaRows } = await pool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
    LIMIT 1
  `);

  if (prismaRows.length === 0) {
    console.log('No _prisma_migrations table found — fresh database, skipping baseline mark.');
  } else {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      )
    `);

    const { rows } = await pool.query<{ hash: string }>(
      `SELECT hash FROM drizzle.__drizzle_migrations WHERE hash = $1`,
      [hash],
    );

    if (rows.length > 0) {
      console.log('Baseline already marked as applied, nothing to do.');
    } else {
      await pool.query(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
        [hash, Date.now()],
      );
      console.log('Baseline migration marked as applied.');
    }
  }
} finally {
  await pool.end();
}
