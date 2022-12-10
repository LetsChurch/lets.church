import { abortMultipartUpload } from '../../../util/s3';

export default async function abortMultipartUploadAction(
  bucket: string,
  uploadKey: string,
  uploadId: string,
) {
  await abortMultipartUpload(bucket, uploadKey, uploadId);
}
