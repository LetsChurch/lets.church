import type { UploadVariant } from '@prisma/client';
import db from '@/util/db';

export default async function recordDownloadSize(
  uploadRecordId: string,
  variant: UploadVariant,
  bytes: number,
) {
  await db.uploadRecordDownloadSize.upsert({
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
