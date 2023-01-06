import prisma from '../../../util/prisma';

export default async function finalizeUpload(
  uploadRecordId: string,
  userId: string,
) {
  await prisma.uploadRecord.update({
    data: {
      uploadFinalized: true,
      uploadFinalizedBy: {
        connect: {
          id: userId,
        },
      },
    },
    where: { id: uploadRecordId },
  });
}
