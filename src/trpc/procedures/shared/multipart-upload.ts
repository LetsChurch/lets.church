import {
  completeMultipartMediaUpload,
  handleMultipartMediaUpload,
} from '@/temporal';
import {
  createMultipartUpload,
  createPresignedPartUploadUrls,
  PART_SIZE,
} from '@/util/s3';
import type { uploadPostProcessValues } from '@/util/types';

export async function handleMultipartUploadCreation({
  targetId,
  uploadMimeType,
  postProcess,
  bytes,
}: {
  targetId: string;
  uploadMimeType: string;
  postProcess: (typeof uploadPostProcessValues)[number];
  bytes: number;
}) {
  const { uploadKey, uploadId } = await createMultipartUpload(
    'INGEST',
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

  const urls = await createPresignedPartUploadUrls(
    'INGEST',
    uploadKey,
    uploadId,
    Math.ceil(bytes / PART_SIZE),
  );

  return {
    s3UploadId: uploadId,
    s3UploadKey: uploadKey,
    urls,
    partSize: PART_SIZE,
  };
}

export async function handleMultipartUploadFinalization({
  s3UploadId,
  s3UploadKey,
  s3PartETags,
  userId,
}: {
  s3UploadId: string;
  s3UploadKey: string;
  s3PartETags: string[];
  userId: string;
}) {
  await completeMultipartMediaUpload(
    s3UploadId,
    s3UploadKey,
    s3PartETags,
    userId,
  );

  return true;
}
