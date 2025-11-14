import type { Prisma } from '@letschurch/db';
import { prisma } from '@letschurch/db';

export default async function createUploadRecord(
  data: Prisma.UploadRecordCreateArgs['data'],
) {
  return prisma.uploadRecord.create({
    data,
  });
}
