import invariant from 'tiny-invariant';
import prisma from '../../../util/prisma';

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
