import { ingestS3 } from '@letschurch/s3/ingest';

export default async function completeMultipartUploadAction(
  uploadId: string,
  uploadKey: string,
  eTags: Array<string>,
): Promise<string> {
  await ingestS3.completeMultipartUpload(uploadId, uploadKey, eTags);

  // Return as string since Temporal cannot serialize bigint
  const { ContentLength } = await ingestS3.headObject(uploadKey);
  if (
    typeof ContentLength !== 'number' ||
    !Number.isFinite(ContentLength) ||
    ContentLength < 0
  ) {
    throw new Error(
      `HeadObject returned an invalid ContentLength for ${uploadKey}`,
    );
  }

  return String(ContentLength);
}
