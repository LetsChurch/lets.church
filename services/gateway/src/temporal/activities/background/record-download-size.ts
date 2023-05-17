import type { UploadVariant } from '@prisma/client';
import prisma from '../../../util/prisma';

export default async function recordDownloadSize(
  uploadRecordId: string,
  variant: UploadVariant,
  bytes: number,
) {
  await prisma.uploadRecordDownloadSize.upsert({
    where: {
      uploadRecordId_variant: {
        uploadRecordId,
        variant,
      },
    },
    create: {
      uploadRecordId,
      variant,
      bytes,
    },
    update: {
      bytes,
    },
  });
}
