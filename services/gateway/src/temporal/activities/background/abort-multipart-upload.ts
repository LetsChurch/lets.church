import { abortMultipartUpload } from '../../../util/s3';

export default async function abortMultipartUploadAction(
  uploadKey: string,
  uploadId: string,
) {
  await abortMultipartUpload(uploadKey, uploadId);
}
