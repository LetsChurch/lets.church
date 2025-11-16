import { z } from 'zod';
import { IncomingIdSchema } from '../common';

// Featured upload schemas
export const addFeaturedUploadSchema = z.object({
  uploadId: IncomingIdSchema,
});

export const removeFeaturedUploadSchema = z.object({
  uploadId: IncomingIdSchema,
});

export const reorderFeaturedUploadsSchema = z.object({
  uploadIds: z.array(IncomingIdSchema).min(1),
});
