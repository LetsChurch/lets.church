import db from '@/util/db';

export default async function finalizeUploadRecord(
  uploadRecordId: string,
  userId: string,
  uploadKey: string,
) {
  await db.uploadRecord.update({
    data: {
      uploadFinalized: true,
      uploadFinalizedBy: {
        connect: {
          id: userId,
        },
      },
      uploadFinalizedAt: new Date(),
      finalizedUploadKey: uploadKey,
    },
    where: { id: uploadRecordId },
  });
}
