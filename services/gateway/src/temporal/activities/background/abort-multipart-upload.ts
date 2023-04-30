import { abortMultipartUpload, Client } from '../../../util/s3';

export default async function abortMultipartUploadAction(
  to: Client,
  uploadId: string,
  uploadKey: string,
) {
  await abortMultipartUpload(to, uploadId, uploadKey);
}
