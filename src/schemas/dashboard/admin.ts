import { z } from 'zod';

// Common field schemas
export const uploadIdSchema = z.string().uuid();

// Featured upload schemas
export const addFeaturedUploadSchema = z.object({
  uploadId: uploadIdSchema,
});

export const removeFeaturedUploadSchema = z.object({
  uploadId: uploadIdSchema,
});

export const reorderFeaturedUploadsSchema = z.object({
  uploadIds: z.array(uploadIdSchema).min(1),
});
