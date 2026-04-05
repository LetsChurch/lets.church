import { db, UploadRecord } from '@letschurch/db';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

export default async function getFinalizedUploadKey(uploadRecordId: string) {
  const row = await db
    .select({ finalizedUploadKey: UploadRecord.finalizedUploadKey })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, uploadRecordId))
    .then((r) => r[0]);

  invariant(row, `Upload record ${uploadRecordId} not found`);

  const { finalizedUploadKey } = row;

  invariant(
    finalizedUploadKey,
    `No finalized upload key found for upload record ${uploadRecordId}`,
  );

  return finalizedUploadKey;
}
