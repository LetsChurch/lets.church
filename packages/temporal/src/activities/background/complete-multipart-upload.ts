import { getS3Client, type S3ClientId } from '../../util/s3';

export default async function completeMultipartUploadAction(
  clientId: S3ClientId,
  uploadId: string,
  uploadKey: string,
  eTags: Array<string>,
): Promise<string> {
  const client = getS3Client(clientId);
  await client.completeMultipartUpload(uploadId, uploadKey, eTags);

  // Get the file size after upload completion
  // Return as string since Temporal cannot serialize bigint
  const head = await client.headObject(uploadKey);
  return String(head?.ContentLength ?? 0);
}
