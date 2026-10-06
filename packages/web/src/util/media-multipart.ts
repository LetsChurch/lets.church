import { PART_SIZE } from '@letschurch/s3';
import { ingestS3 } from '@letschurch/s3/ingest';

import { handleMultipartMediaUpload } from '@/temporal';

type UploadPostProcessValue = Parameters<typeof handleMultipartMediaUpload>[4];

/**
 * Open an S3 multipart upload for `targetId` in the ingest bucket, start the
 * workflow that waits for the client's finalize signal, and presign every part
 * URL.
 *
 * Callers are responsible for authorizing `targetId` (binding it to the
 * channel/user they authenticated).
 */
export async function startMultipartUpload({
  targetId,
  uploadMimeType,
  bytes,
  postProcess,
}: {
  targetId: string;
  uploadMimeType: string;
  bytes: number;
  postProcess: UploadPostProcessValue;
}) {
  const { uploadKey, uploadId } = await ingestS3.createMultipartUpload(
    targetId,
    uploadMimeType,
  );

  await handleMultipartMediaUpload(
    targetId,
    'INGEST',
    uploadId,
    uploadKey,
    postProcess,
  );

  const urls = await ingestS3.createPresignedPartUploadUrls(
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
