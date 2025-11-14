import type { Prisma } from '@letschurch/db';
import { prisma } from '@letschurch/db';

export default async function updateUploadRecord(
  uploadRecordId: string,
  data: Prisma.UploadRecordUpdateArgs['data'],
) {
  await prisma.uploadRecord.update({
    where: {
      id: uploadRecordId,
    },
    data,
  });
}
