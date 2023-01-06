import { completeMultipartUpload } from '../../../util/s3';

export default async function completeMultipartUploadAction(
  bucket: string,
  uploadId: string,
  uploadKey: string,
  eTags: Array<string>,
) {
  await completeMultipartUpload(bucket, uploadId, uploadKey, eTags);
}
