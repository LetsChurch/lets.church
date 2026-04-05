import {
  db,
  UploadRecordDownloadSize,
  type UploadVariant,
} from '@letschurch/db';

export default async function recordDownloadSize(
  uploadRecordId: string,
  variant: (typeof UploadVariant.enumValues)[number],
  bytes: number,
) {
  await db
    .insert(UploadRecordDownloadSize)
    .values({
      uploadRecordId,
      variant,
      bytes: BigInt(bytes),
    })
    .onConflictDoUpdate({
      target: [
        UploadRecordDownloadSize.uploadRecordId,
        UploadRecordDownloadSize.variant,
      ],
      set: {
        bytes: BigInt(bytes),
      },
    });
}
