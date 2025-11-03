import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/util/db';

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
