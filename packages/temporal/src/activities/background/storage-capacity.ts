import { db, UploadRecord } from '@letschurch/db';
import { eq, sql } from 'drizzle-orm';

import { chooseLocation } from '../../storage/placement';
import {
  getLocationCandidates,
  locationFits,
  measurePrefixBytes,
} from '../../storage/usage';
import { estimateHlsOutputBytes } from '../../util/ffmpeg';
import logger from '../../util/logger';
import type { Probe } from '../../util/zod';

const moduleLogger = logger.child({
  module: 'activities/background/storage-capacity',
});

export type StorageCapacityDecision =
  | { action: 'proceed'; storageLocation: string }
  | { action: 'relocate'; storageLocation: string; targetLocation: string }
  | { action: 'wait'; storageLocation: string }
  | { action: 'moving'; storageLocation: string };

/**
 * Post-probe capacity check, run before any artifact is written to public.
 *
 * Replaces the admission-time ratio estimate with a precise one (ladder
 * bitrates × duration) and decides:
 *  - proceed: the record's location can hold the output; reservation updated
 *  - relocate: it can't, but another location can hold the whole record
 *  - wait: nowhere fits; processing parks until capacity frees up
 *
 * Re-uploads only need the growth over what the record already holds, since
 * the new transcode replaces the old artifacts in place.
 */
export async function ensureStorageCapacity(
  uploadRecordId: string,
  probe: Probe,
): Promise<StorageCapacityDecision> {
  const [record] = await db
    .select({
      storageLocation: UploadRecord.storageLocation,
      uploadSizeBytes: UploadRecord.uploadSizeBytes,
      publicSizeBytes: UploadRecord.publicSizeBytes,
      publicReservedBytes: UploadRecord.publicReservedBytes,
      storageMoveId: UploadRecord.storageMoveId,
    })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, uploadRecordId));
  if (!record) {
    throw new Error(`Upload record ${uploadRecordId} not found`);
  }
  // Writing while a move copies the prefix would strand artifacts at the
  // source; wait for the move to flip or roll back.
  if (record.storageMoveId) {
    return { action: 'moving', storageLocation: record.storageLocation };
  }

  const estimate = estimateHlsOutputBytes(probe);
  const existing = record.publicSizeBytes ?? 0n;
  const growth = estimate > existing ? estimate - existing : 0n;
  const currentReservation = record.publicReservedBytes ?? 0n;

  // locationFits counts this record's current reservation as already used;
  // ask only for the difference so it isn't counted twice.
  const fitsHere = await locationFits(record.storageLocation, {
    ingestBytes: 0n,
    publicBytes: growth - currentReservation,
  });

  if (fitsHere) {
    await db
      .update(UploadRecord)
      .set({ publicReservedBytes: growth, storageWaitingSince: null })
      .where(eq(UploadRecord.id, uploadRecordId));
    return { action: 'proceed', storageLocation: record.storageLocation };
  }

  // Moving relocates everything the record holds plus the new output.
  const target = chooseLocation(await getLocationCandidates(), {
    sourceBytes: record.uploadSizeBytes ?? 0n,
    reservation: {
      ingestBytes: record.uploadSizeBytes ?? 0n,
      publicBytes: existing + growth,
    },
    exclude: [record.storageLocation],
  });

  if (target) {
    moduleLogger.warn(
      {
        uploadId: uploadRecordId,
        context: {
          from: record.storageLocation,
          to: target.id,
          estimate: String(estimate),
        },
      },
      'Processed output will not fit; relocating before transcode',
    );
    return {
      action: 'relocate',
      storageLocation: record.storageLocation,
      targetLocation: target.id,
    };
  }

  moduleLogger.error(
    {
      uploadId: uploadRecordId,
      context: { location: record.storageLocation, estimate: String(estimate) },
    },
    'No storage location can hold processed output; parking processing',
  );
  // Keep the original timestamp across re-checks so the admin UI shows how
  // long the record has been waiting.
  await db
    .update(UploadRecord)
    .set({
      storageWaitingSince: sql`coalesce(${UploadRecord.storageWaitingSince}, now())`,
    })
    .where(eq(UploadRecord.id, uploadRecordId));
  return { action: 'wait', storageLocation: record.storageLocation };
}

/**
 * Measure the bytes under the record's public prefix and replace its
 * reservation with the real number. Run after (re)processing writes.
 */
export async function measurePublicUsage(uploadRecordId: string) {
  const [record] = await db
    .select({ storageLocation: UploadRecord.storageLocation })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, uploadRecordId));
  if (!record) return;

  const { bytes } = await measurePrefixBytes(
    record.storageLocation,
    'PUBLIC',
    `${uploadRecordId}/`,
  );
  await db
    .update(UploadRecord)
    .set({ publicSizeBytes: bytes, publicReservedBytes: null })
    .where(eq(UploadRecord.id, uploadRecordId));
}

/** The record's current storage location (for workers without DB access). */
export async function getUploadStorageLocation(
  uploadRecordId: string,
): Promise<string> {
  const [record] = await db
    .select({ storageLocation: UploadRecord.storageLocation })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, uploadRecordId));
  if (!record) {
    throw new Error(`Upload record ${uploadRecordId} not found`);
  }
  return record.storageLocation;
}
