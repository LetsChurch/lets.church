import { updateUploadRecord } from '../../client';

export default async function setUploadThumbnail(
  uploadRecordId: string,
  path: string,
  blurhash: string,
) {
  await updateUploadRecord(uploadRecordId, {
    overrideThumbnailPath: path,
    overrideThumbnailBlurhash: blurhash,
  });
}
