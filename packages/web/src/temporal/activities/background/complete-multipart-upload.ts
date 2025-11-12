import { getS3Client, type S3ClientId } from '../../../util/s3';

export default async function completeMultipartUploadAction(
  clientId: S3ClientId,
  uploadId: string,
  uploadKey: string,
  eTags: Array<string>,
) {
  const client = getS3Client(clientId);
  await client.completeMultipartUpload(uploadId, uploadKey, eTags);
}
