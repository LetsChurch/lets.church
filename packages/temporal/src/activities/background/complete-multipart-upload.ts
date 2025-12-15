import { ingestS3 } from '@letschurch/s3/ingest';

export default async function completeMultipartUploadAction(
  uploadId: string,
  uploadKey: string,
  eTags: Array<string>,
): Promise<string> {
  await ingestS3.completeMultipartUpload(uploadId, uploadKey, eTags);

  // Get the file size after upload completion
  // Return as string since Temporal cannot serialize bigint
  const head = await ingestS3.headObject(uploadKey);
  return String(head?.ContentLength ?? 0);
}
