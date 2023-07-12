import prisma from '../../../util/prisma';

export default async function finalizeUploadRecord(
  uploadRecordId: string,
  userId: string,
  uploadKey: string,
) {
  await prisma.uploadRecord.update({
    data: {
      uploadFinalized: true,
      uploadFinalizedBy: {
        connect: {
          id: userId,
        },
      },
      finalizedUploadKey: uploadKey,
    },
    where: { id: uploadRecordId },
  });
}
