import type { UploadVariant } from '@/generated/prisma/client';
import { prisma } from '@/util/db';

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
