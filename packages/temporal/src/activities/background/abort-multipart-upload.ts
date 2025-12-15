import { ingestS3 } from '@letschurch/s3/ingest';

export default async function abortMultipartUploadAction(
  uploadId: string,
  uploadKey: string,
) {
  await ingestS3.abortMultipartUpload(uploadId, uploadKey);
}
