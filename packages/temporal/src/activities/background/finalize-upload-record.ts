import { db, UploadRecord } from '@letschurch/db';
import { eq } from 'drizzle-orm';

export default async function finalizeUploadRecord(
  uploadRecordId: string,
  userId: string,
  uploadKey: string,
) {
  await db
    .update(UploadRecord)
    .set({
      uploadFinalized: true,
      uploadFinalizedById: userId,
      uploadFinalizedAt: new Date(),
      finalizedUploadKey: uploadKey,
      updatedAt: new Date(),
    })
    .where(eq(UploadRecord.id, uploadRecordId));
}
