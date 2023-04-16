import type { Prisma } from '@prisma/client';
import prisma from '../../../util/prisma';

export type DocumentKind = 'transcript' | 'upload' | 'organization' | 'channel';

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
