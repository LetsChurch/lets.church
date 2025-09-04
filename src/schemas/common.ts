import { z } from 'zod';
import { uploadPostProcessValues } from '@/util/types';

export const multipartUploadSchema = z.object({
  channelId: z.uuid(),
  targetId: z.string(),
  uploadMimeType: z.string(),
  postProcess: z.enum(uploadPostProcessValues),
  bytes: z.number(),
});

export const finalizeMultipartUploadSchema = z.object({
  channelId: z.uuid(),
  s3UploadId: z.string(),
  s3UploadKey: z.string(),
  s3PartETags: z.array(z.string()),
});
