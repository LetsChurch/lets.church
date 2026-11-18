import { db, UploadRecord } from '@letschurch/db';
import { ApplicationFailure } from '@temporalio/activity';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

/** The upload record's key and tombstone, or `undefined` once it's gone. */
export async function findUploadRecord(uploadRecordId: string) {
  return db
    .select({
      finalizedUploadKey: UploadRecord.finalizedUploadKey,
      deletedAt: UploadRecord.deletedAt,
    })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, uploadRecordId))
    .then((r) => r[0]);
}

export default async function getFinalizedUploadKey(uploadRecordId: string) {
  const row = await findUploadRecord(uploadRecordId);

  if (!row || row.deletedAt) {
    // The upload was (or is being) deleted; retrying can't bring it back.
    throw ApplicationFailure.nonRetryable(
      `Upload record ${uploadRecordId} ${row ? 'is being deleted' : 'not found'}`,
      'UploadRecordDeleted',
    );
  }

  const { finalizedUploadKey } = row;

  invariant(
    finalizedUploadKey,
    `No finalized upload key found for upload record ${uploadRecordId}`,
  );

  return finalizedUploadKey;
}

/**
 * Whether the upload has been deleted: its record is gone, or tombstoned by a
 * delete that is still in progress.
 */
export async function isUploadDeleted(
  uploadRecordId: string,
): Promise<boolean> {
  const row = await findUploadRecord(uploadRecordId);
  return !row || row.deletedAt !== null;
}
