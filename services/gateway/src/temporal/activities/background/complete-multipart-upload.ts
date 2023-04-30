import { Client, completeMultipartUpload } from '../../../util/s3';

export default async function completeMultipartUploadAction(
  to: Client,
  uploadId: string,
  uploadKey: string,
  eTags: Array<string>,
) {
  await completeMultipartUpload(to, uploadId, uploadKey, eTags);
}
