import {
  db,
  FeaturedUpload,
  type TransactionClient,
  UploadRecord,
} from '@letschurch/db';
import { asc, eq, gt, gte, sql } from 'drizzle-orm';

// Global persistence lock for the site-wide featured list. Every writer must
// acquire this transaction-scoped key before reading or changing the list.
export const FEATURED_UPLOADS_ADVISORY_LOCK_KEY = 1_279_474_502;

type FeaturedUploadOrderingErrorCode =
  | 'ALREADY_FEATURED'
  | 'FEATURED_UPLOAD_NOT_FOUND'
  | 'INVARIANT_VIOLATION'
  | 'STALE_ORDER'
  | 'STALE_WRITE'
  | 'UPLOAD_NOT_FOUND'
  | 'UPLOAD_NOT_FULLY_PROCESSED'
  | 'UPLOAD_NOT_PUBLIC'
  | 'UPLOAD_NOT_TRANSCODED';

export class FeaturedUploadOrderingError extends Error {
  constructor(readonly code: FeaturedUploadOrderingErrorCode) {
    super(code);
    this.name = 'FeaturedUploadOrderingError';
  }
}

type FeaturedUploadSnapshot = {
  uploadRecordId: string;
  rank: number;
};

async function withFeaturedUploadOrderingLock<T>(
  callback: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${FEATURED_UPLOADS_ADVISORY_LOCK_KEY})`,
    );
    return callback(tx);
  });
}

async function readFeaturedUploadSnapshot(
  tx: TransactionClient,
): Promise<FeaturedUploadSnapshot[]> {
  const snapshot = await tx
    .select({
      uploadRecordId: FeaturedUpload.uploadRecordId,
      rank: FeaturedUpload.rank,
    })
    .from(FeaturedUpload)
    .orderBy(asc(FeaturedUpload.rank));

  if (snapshot.some(({ rank }, index) => rank !== index)) {
    throw new FeaturedUploadOrderingError('INVARIANT_VIOLATION');
  }

  return snapshot;
}

async function requireEligibleUpload(
  tx: TransactionClient,
  uploadId: string,
  requireTranscript: boolean,
) {
  const [upload] = await tx
    .select({
      id: UploadRecord.id,
      visibility: UploadRecord.visibility,
      transcodingFinishedAt: UploadRecord.transcodingFinishedAt,
      transcribingFinishedAt: UploadRecord.transcribingFinishedAt,
    })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, uploadId))
    .for('update');

  if (!upload) {
    throw new FeaturedUploadOrderingError('UPLOAD_NOT_FOUND');
  }
  if (upload.visibility !== 'PUBLIC') {
    throw new FeaturedUploadOrderingError('UPLOAD_NOT_PUBLIC');
  }
  if (!upload.transcodingFinishedAt) {
    throw new FeaturedUploadOrderingError(
      requireTranscript
        ? 'UPLOAD_NOT_FULLY_PROCESSED'
        : 'UPLOAD_NOT_TRANSCODED',
    );
  }
  if (requireTranscript && !upload.transcribingFinishedAt) {
    throw new FeaturedUploadOrderingError('UPLOAD_NOT_FULLY_PROCESSED');
  }
}

function requireRowCount(rows: unknown[], expected: number) {
  if (rows.length !== expected) {
    throw new FeaturedUploadOrderingError('STALE_WRITE');
  }
}

async function removeFromSnapshot(
  tx: TransactionClient,
  snapshot: FeaturedUploadSnapshot[],
  removed: FeaturedUploadSnapshot,
) {
  const deleted = await tx
    .delete(FeaturedUpload)
    .where(eq(FeaturedUpload.uploadRecordId, removed.uploadRecordId))
    .returning({ uploadRecordId: FeaturedUpload.uploadRecordId });
  requireRowCount(deleted, 1);

  const shiftedCount = snapshot.length - removed.rank - 1;
  if (shiftedCount === 0) return;

  const updatedAt = new Date();
  const offset = snapshot.length;
  const staged = await tx
    .update(FeaturedUpload)
    .set({
      rank: sql`${FeaturedUpload.rank} + ${offset}`,
      updatedAt,
    })
    .where(gt(FeaturedUpload.rank, removed.rank))
    .returning({ uploadRecordId: FeaturedUpload.uploadRecordId });
  requireRowCount(staged, shiftedCount);

  const compacted = await tx
    .update(FeaturedUpload)
    .set({
      rank: sql`${FeaturedUpload.rank} - ${offset + 1}`,
      updatedAt,
    })
    .where(gte(FeaturedUpload.rank, offset))
    .returning({ uploadRecordId: FeaturedUpload.uploadRecordId });
  requireRowCount(compacted, shiftedCount);
}

export async function addFeaturedUploadAtomically(uploadId: string) {
  return withFeaturedUploadOrderingLock(async (tx) => {
    const snapshot = await readFeaturedUploadSnapshot(tx);
    await requireEligibleUpload(tx, uploadId, true);

    if (snapshot.some((row) => row.uploadRecordId === uploadId)) {
      throw new FeaturedUploadOrderingError('ALREADY_FEATURED');
    }

    const rank = snapshot.length;
    const inserted = await tx
      .insert(FeaturedUpload)
      .values({ uploadRecordId: uploadId, rank, updatedAt: new Date() })
      .returning();
    requireRowCount(inserted, 1);

    return { featuredUpload: inserted[0]!, rank };
  });
}

export async function removeFeaturedUploadAtomically(uploadId: string) {
  return withFeaturedUploadOrderingLock(async (tx) => {
    const snapshot = await readFeaturedUploadSnapshot(tx);
    const removed = snapshot.find((row) => row.uploadRecordId === uploadId);
    if (!removed) {
      throw new FeaturedUploadOrderingError('FEATURED_UPLOAD_NOT_FOUND');
    }

    await removeFromSnapshot(tx, snapshot, removed);
  });
}

export async function reorderFeaturedUploadsAtomically(uploadIds: string[]) {
  return withFeaturedUploadOrderingLock(async (tx) => {
    const snapshot = await readFeaturedUploadSnapshot(tx);
    const existingIds = new Set(snapshot.map((row) => row.uploadRecordId));
    const inputIds = new Set(uploadIds);
    if (
      inputIds.size !== uploadIds.length ||
      uploadIds.length !== snapshot.length ||
      uploadIds.some((uploadId) => !existingIds.has(uploadId))
    ) {
      throw new FeaturedUploadOrderingError('STALE_ORDER');
    }

    if (snapshot.length === 0) return;

    const updatedAt = new Date();
    const offset = snapshot.length;
    const staged = await tx
      .update(FeaturedUpload)
      .set({
        rank: sql`${FeaturedUpload.rank} + ${offset}`,
        updatedAt,
      })
      .returning({ uploadRecordId: FeaturedUpload.uploadRecordId });
    requireRowCount(staged, snapshot.length);

    for (const [rank, uploadRecordId] of uploadIds.entries()) {
      const updated = await tx
        .update(FeaturedUpload)
        .set({ rank, updatedAt })
        .where(eq(FeaturedUpload.uploadRecordId, uploadRecordId))
        .returning({ uploadRecordId: FeaturedUpload.uploadRecordId });
      requireRowCount(updated, 1);
    }
  });
}

export async function toggleFeaturedUploadAtomically(uploadId: string) {
  return withFeaturedUploadOrderingLock(async (tx) => {
    const snapshot = await readFeaturedUploadSnapshot(tx);
    const existing = snapshot.find((row) => row.uploadRecordId === uploadId);

    if (existing) {
      await removeFromSnapshot(tx, snapshot, existing);
      return { isFeatured: false } as const;
    }

    await requireEligibleUpload(tx, uploadId, false);

    const updatedAt = new Date();
    const offset = snapshot.length + 1;
    if (snapshot.length > 0) {
      const staged = await tx
        .update(FeaturedUpload)
        .set({
          rank: sql`${FeaturedUpload.rank} + ${offset}`,
          updatedAt,
        })
        .returning({ uploadRecordId: FeaturedUpload.uploadRecordId });
      requireRowCount(staged, snapshot.length);

      const shifted = await tx
        .update(FeaturedUpload)
        .set({
          rank: sql`${FeaturedUpload.rank} - ${offset - 1}`,
          updatedAt,
        })
        .where(gte(FeaturedUpload.rank, offset))
        .returning({ uploadRecordId: FeaturedUpload.uploadRecordId });
      requireRowCount(shifted, snapshot.length);
    }

    const inserted = await tx
      .insert(FeaturedUpload)
      .values({ uploadRecordId: uploadId, rank: 0, updatedAt })
      .returning({ uploadRecordId: FeaturedUpload.uploadRecordId });
    requireRowCount(inserted, 1);

    return { isFeatured: true } as const;
  });
}
