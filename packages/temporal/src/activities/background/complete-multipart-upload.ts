import { getS3Client, type S3ClientId } from '../../util/s3';

export default async function completeMultipartUploadAction(
  clientId: S3ClientId,
  uploadId: string,
  uploadKey: string,
  eTags: Array<string>,
): Promise<bigint> {
  const client = getS3Client(clientId);
  await client.completeMultipartUpload(uploadId, uploadKey, eTags);

  // Get the file size after upload completion
  const head = await client.headObject(uploadKey);
  return BigInt(head?.ContentLength ?? 0);
}
