import { db, UploadRecord } from '@letschurch/db';
import { getLocation, type StorageLocation } from '@letschurch/s3/locations';
import {
  estimatePublicBytes,
  StorageFullError,
} from '@letschurch/temporal/storage/placement';
import { pickLocation } from '@letschurch/temporal/storage/usage';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';

import logger from '@/util/logger';

const moduleLogger = logger.child({ module: 'util/storage' });

/** Map placement failures to a client-facing tRPC error. */
async function withStorageErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StorageFullError) {
      moduleLogger.error(
        { err, context: { sourceBytes: String(err.sourceBytes) } },
        'Storage full: no location can accept upload',
      );
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          'Storage is full right now. Please try again later or contact support.',
        cause: err,
      });
    }
    throw err;
  }
}

/**
 * Location for a brand-new upload record, before its size is known. The
 * real placement happens in `placeMediaUpload` once the client reports the
 * file size; this only needs *a* location that is accepting uploads so the
 * NOT NULL column can be filled.
 */
export async function initialRecordLocation(): Promise<string> {
  return withStorageErrors(async () => {
    const chosen = await pickLocation({ sourceBytes: 0n });
    return chosen.id;
  });
}

/**
 * Decide where a media upload's source goes, right before presigning.
 *
 * - First upload for the record: pick a location for `bytes` (caps include
 *   the estimated processed output) and hold that estimate as the record's
 *   public reservation.
 * - Re-upload onto a record that already has objects: stay at the record's
 *   location, since its existing artifacts live there. The post-probe
 *   capacity check relocates the record if it no longer fits.
 *
 * Throws CONFLICT while a storage move holds the record.
 */
export async function placeMediaUpload(
  uploadRecordId: string,
  bytes: number,
): Promise<StorageLocation> {
  return withStorageErrors(async () => {
    const record = await db.query.UploadRecord.findFirst({
      where: (t, { eq }) => eq(t.id, uploadRecordId),
      columns: {
        storageLocation: true,
        finalizedUploadKey: true,
        storageMoveId: true,
      },
    });
    if (!record) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    if (record.storageMoveId) {
      throw new TRPCError({
        code: 'CONFLICT',
        message:
          'This upload is being moved between storage locations. Try again shortly.',
      });
    }
    if (record.finalizedUploadKey) {
      return getLocation(record.storageLocation);
    }

    const sourceBytes = BigInt(bytes);
    const chosen = await pickLocation({ sourceBytes });
    await db
      .update(UploadRecord)
      .set({
        storageLocation: chosen.id,
        publicReservedBytes: estimatePublicBytes(
          sourceBytes,
          chosen.usage.publicRatio,
        ),
      })
      .where(eq(UploadRecord.id, uploadRecordId));
    return getLocation(chosen.id);
  });
}

/** Location for a new image upload (avatar, cover, default thumbnail). */
export async function placeImageUpload(
  bytes: number,
): Promise<StorageLocation> {
  return withStorageErrors(async () => {
    const chosen = await pickLocation({ sourceBytes: BigInt(bytes) });
    return getLocation(chosen.id);
  });
}

/** Location holding an upload record's thumbnail override upload. */
export async function recordLocation(
  uploadRecordId: string,
): Promise<StorageLocation> {
  const record = await db.query.UploadRecord.findFirst({
    where: (t, { eq }) => eq(t.id, uploadRecordId),
    columns: { storageLocation: true },
  });
  if (!record) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  return getLocation(record.storageLocation);
}
