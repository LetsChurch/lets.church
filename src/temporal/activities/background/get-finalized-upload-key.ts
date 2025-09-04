import { invariant } from 'es-toolkit';
import db from '@/util/db';

export default async function getFinalizedUploadKey(uploadRecordId: string) {
  const { finalizedUploadKey } = await db.uploadRecord.findUniqueOrThrow({
    select: { finalizedUploadKey: true },
    where: { id: uploadRecordId },
  });

  invariant(
    finalizedUploadKey,
    `No finalized upload key found for upload record ${uploadRecordId}`,
  );

  return finalizedUploadKey;
}
