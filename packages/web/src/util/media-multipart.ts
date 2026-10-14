import { PART_SIZE } from '@letschurch/s3';
import type { StorageLocation } from '@letschurch/s3/locations';

import { handleMultipartMediaUpload } from '@/temporal';

type UploadPostProcessValue = Parameters<typeof handleMultipartMediaUpload>[4];

/**
 * Open an S3 multipart upload for `targetId` at `location`, start the workflow
 * that waits for the client's finalize signal, and presign every part URL.
 *
 * Callers are responsible for authorizing `targetId` (binding it to the
 * channel/user they authenticated) and picking `location`.
 */
export async function startMultipartUpload({
  targetId,
  location,
  uploadMimeType,
  bytes,
  postProcess,
}: {
  targetId: string;
  location: StorageLocation;
  uploadMimeType: string;
  bytes: number;
  postProcess: UploadPostProcessValue;
}) {
  const { uploadKey, uploadId } = await location.ingest.createMultipartUpload(
    targetId,
    uploadMimeType,
  );

  await handleMultipartMediaUpload(
    targetId,
    location.id,
    uploadId,
    uploadKey,
    postProcess,
  );

  const urls = await location.ingest.createPresignedPartUploadUrls(
    uploadId,
    uploadKey,
    bytes,
  );

  return {
    s3UploadKey: uploadKey,
    s3UploadId: uploadId,
    partSize: PART_SIZE,
    urls,
  };
}
