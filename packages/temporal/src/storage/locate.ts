import { db, UploadRecord, UploadState } from '@letschurch/db';
import { getLocation, type StorageLocation } from '@letschurch/s3/locations';
import { eq } from 'drizzle-orm';

/**
 * The storage location holding an upload record's source and artifacts.
 * Activities resolve this from the DB rather than taking it as workflow
 * input, so a record moved between locations is always read and written at
 * its current home, and in-flight workflows survive the deploy.
 */
export async function uploadRecordLocation(
  uploadRecordId: string,
): Promise<StorageLocation> {
  const [row] = await db
    .select({ storageLocation: UploadRecord.storageLocation })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, uploadRecordId));
  if (!row) {
    throw new Error(`Upload record ${uploadRecordId} not found`);
  }
  return getLocation(row.storageLocation);
}

/** Location of a tracked source object, by its ingest key. */
export async function uploadStateLocationByKey(
  s3Key: string,
): Promise<StorageLocation | null> {
  const [row] = await db
    .select({ storageLocation: UploadState.storageLocation })
    .from(UploadState)
    .where(eq(UploadState.s3Key, s3Key));
  return row ? getLocation(row.storageLocation) : null;
}
