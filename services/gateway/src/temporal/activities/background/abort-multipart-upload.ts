import { abortMultipartUpload } from '../../../util/s3';

export default async function abortMultipartUploadAction(
  bucket: string,
  uploadId: string,
  uploadKey: string,
) {
  await abortMultipartUpload(bucket, uploadId, uploadKey);
}
