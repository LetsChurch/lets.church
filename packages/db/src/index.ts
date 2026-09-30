import { logger as baseLogger } from '@letschurch/util';
import { asc, eq, sql } from 'drizzle-orm';
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

// Every featured-list writer, including upload/channel deletion (which cascades
// through featured_upload), must hold this lock until its transaction commits.
const FEATURED_UPLOADS_ADVISORY_LOCK_KEY = 1_279_474_502;

export async function withFeaturedUploadOrderingLock<T>(
  callback: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${FEATURED_UPLOADS_ADVISORY_LOCK_KEY})`,
    );
    return callback(tx);
  });
}

// Also repairs gaps left by older upload deletions that cascaded the featured
// row without renumbering the survivors. Iterate in ascending order: for
// nonnegative unique ranks, each new rank is an unused slot below the old one.
export async function compactFeaturedUploadRanks(tx: TransactionClient) {
  const snapshot = await tx
    .select({
      uploadRecordId: schema.FeaturedUpload.uploadRecordId,
      rank: schema.FeaturedUpload.rank,
    })
    .from(schema.FeaturedUpload)
    .orderBy(asc(schema.FeaturedUpload.rank));

  if (snapshot.some(({ rank }) => rank < 0)) {
    throw new Error('Featured upload ranks must be nonnegative');
  }

  let updatedAt: Date | undefined;
  for (const [rank, row] of snapshot.entries()) {
    if (row.rank === rank) continue;
    updatedAt ??= new Date();
    const updated = await tx
      .update(schema.FeaturedUpload)
      .set({ rank, updatedAt })
      .where(eq(schema.FeaturedUpload.uploadRecordId, row.uploadRecordId))
      .returning({ uploadRecordId: schema.FeaturedUpload.uploadRecordId });
    if (updated.length !== 1) {
      throw new Error('Featured upload changed while compacting ranks');
    }
    row.rank = rank;
  }

  return snapshot;
}

export function parseDatabaseEnv() {
  return z.object({ DATABASE_URL: z.string() }).parse(process.env);
}
