import { completeMultipartUpload } from '../../../util/s3';

export default async function completeMultipartUploadAction(
  bucket: string,
  uploadKey: string,
  uploadId: string,
  eTags: Array<string>,
) {
  await completeMultipartUpload(bucket, uploadKey, uploadId, eTags);
}
