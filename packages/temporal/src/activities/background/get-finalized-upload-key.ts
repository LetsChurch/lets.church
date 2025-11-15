import { prisma } from '@letschurch/db';
import { invariant } from 'es-toolkit';

export default async function getFinalizedUploadKey(uploadRecordId: string) {
  const { finalizedUploadKey } = await prisma.uploadRecord.findUniqueOrThrow({
    select: { finalizedUploadKey: true },
    where: { id: uploadRecordId },
  });

  invariant(
    finalizedUploadKey,
    `No finalized upload key found for upload record ${uploadRecordId}`,
  );

  return finalizedUploadKey;
}
