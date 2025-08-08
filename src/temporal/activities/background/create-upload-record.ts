import type { Prisma } from '@prisma/client';
import db from '@/util/db';

export default async function createUploadRecord(
  data: Prisma.UploadRecordCreateArgs['data'],
) {
  return db.uploadRecord.create({
    data,
  });
}
