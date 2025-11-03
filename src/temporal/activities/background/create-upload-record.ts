import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/util/db';

export default async function createUploadRecord(
  data: Prisma.UploadRecordCreateArgs['data'],
) {
  return prisma.uploadRecord.create({
    data,
  });
}
