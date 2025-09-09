import { z } from 'zod';

export const multipartUploadSchema = z.object({
  targetId: z.string(),
  uploadMimeType: z.string(),
  bytes: z.number(),
});

export const finalizeMultipartUploadSchema = z.object({
  s3UploadId: z.string(),
  s3UploadKey: z.string(),
  s3PartETags: z.array(z.string()),
});
