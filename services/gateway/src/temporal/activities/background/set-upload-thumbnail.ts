import { updateUploadRecord } from '../..';

export default async function setUploadThumbnail(
  uploadRecordId: string,
  path: string,
  blurhash: string,
) {
  await updateUploadRecord(uploadRecordId, {
    defaultThumbnailPath: path,
    thumbnailBlurhash: blurhash,
  });
}
