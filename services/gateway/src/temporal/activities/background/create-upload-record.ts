import type { Prisma } from '@prisma/client';
import prisma from '../../../util/prisma';

export default async function updateUploadRecord(
  data: Prisma.UploadRecordCreateArgs['data'],
) {
  const rec = await prisma.uploadRecord.create({
    data,
  });

  return rec.id;
}
