import type { Prisma } from '@prisma/client';
import db from '@/util/db';

export default async function updateUploadRecord(
  uploadRecordId: string,
  data: Prisma.UploadRecordUpdateArgs['data'],
) {
  await db.uploadRecord.update({
    where: {
      id: uploadRecordId,
    },
    data,
  });
}
