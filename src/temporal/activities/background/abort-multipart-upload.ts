import { getS3Client, type S3ClientId } from '../../../util/s3';

export default async function abortMultipartUploadAction(
  clientId: S3ClientId,
  uploadId: string,
  uploadKey: string,
) {
  const client = getS3Client(clientId);
  await client.abortMultipartUpload(uploadId, uploadKey);
}
