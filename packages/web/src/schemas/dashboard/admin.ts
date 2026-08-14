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
  uploadIds: z
    .array(IncomingIdSchema)
    .min(1)
    .refine(
      (uploadIds) => new Set(uploadIds).size === uploadIds.length,
      'Upload IDs must be unique',
    ),
});

// Maintenance mode
export const setMaintenanceModeSchema = z.object({
  maintenanceMode: z.boolean(),
  // Normalize blank/whitespace-only input to null so the page falls back to the
  // default copy.
  maintenanceMessage: z
    .string()
    .max(1000)
    .nullable()
    .transform((v) => {
      const trimmed = v?.trim();
      return trimmed ? trimmed : null;
    }),
});
