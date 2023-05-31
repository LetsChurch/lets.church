import type { Prisma } from '@prisma/client';
import prisma from '../../../util/prisma';

export default async function createUploadRecord(
  data: Prisma.UploadRecordCreateArgs['data'],
) {
  return prisma.uploadRecord.create({
    data,
  });
}
