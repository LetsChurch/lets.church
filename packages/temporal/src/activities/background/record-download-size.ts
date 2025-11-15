import type { UploadVariant } from '@letschurch/db';
import { prisma } from '@letschurch/db';

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
