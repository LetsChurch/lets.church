import prisma from '../../../util/prisma';

export default async function getProbe(uploadRecordId: string) {
  const res = await prisma.uploadRecord.findUnique({
    select: { finalizedUploadKey: true },
    where: { id: uploadRecordId },
  });
  return res?.finalizedUploadKey;
}
