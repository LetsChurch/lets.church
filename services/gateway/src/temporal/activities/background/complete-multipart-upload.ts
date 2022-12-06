import { completeMultipartUpload } from '../../../util/s3';

export default async function completeMultipartUploadAction(
  uploadKey: string,
  uploadId: string,
  eTags: Array<string>,
) {
  await completeMultipartUpload(uploadKey, uploadId, eTags);
}
