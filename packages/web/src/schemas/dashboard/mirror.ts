import { UploadVisibility } from '@letschurch/db/types';
import sanitizeFilename from 'sanitize-filename';
import { z } from 'zod';

import { channelIdSchema, uploadIdSchema } from './channel';

// Bounds for media mirrored from another platform by the browser extension.
// YouTube caps titles at 100 and descriptions at 5,000 characters; leave
// headroom without accepting unbounded input (docs/security.md §1, §6).
export const MIRROR_TITLE_MAX = 255;
export const MIRROR_DESCRIPTION_MAX = 10_000;
export const MIRROR_DUPLICATE_CANDIDATES_MAX = 100;
// 10 MB parts × S3's 10,000-part limit, matching `multipartUploadSchema`.
const MIRROR_MAX_BYTES = 10_000_000 * 10_000;
// YouTube's own thumbnail limit is 2 MB at upload; the max-res renditions
// Studio serves are well under that. Leave headroom, but stay small.
export const MIRROR_THUMBNAIL_MAX_BYTES = 20_000_000;

const mirrorFileNameSchema = z
  .string()
  .max(255)
  .transform((val) => sanitizeFilename(val));

export const createMirrorUploadSchema = z.object({
  channelId: channelIdSchema,
  title: z.string().trim().min(1).max(MIRROR_TITLE_MAX),
  description: z.string().max(MIRROR_DESCRIPTION_MAX).default(''),
  publishedAt: z.date(),
  originalFileName: mirrorFileNameSchema.optional(),
  uploadMimeType: z
    .string()
    .max(100)
    .regex(/^(video|audio)\/[\w.+-]+$/, 'Only video or audio files'),
  bytes: z.number().int().positive().max(MIRROR_MAX_BYTES),
  visibility: z.nativeEnum(UploadVisibility).optional(),
});

export const finalizeMirrorUploadSchema = z.object({
  channelId: channelIdSchema,
  uploadId: uploadIdSchema,
  s3UploadId: z.string().min(1).max(1024),
  s3UploadKey: z.string().min(1).max(1024),
  s3PartETags: z.array(z.string().min(1).max(256)).min(1).max(10_000),
});

export const createMirrorThumbnailUploadSchema = z.object({
  channelId: channelIdSchema,
  uploadId: uploadIdSchema,
  uploadMimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  bytes: z.number().int().positive().max(MIRROR_THUMBNAIL_MAX_BYTES),
});

export const abortMirrorUploadSchema = z.object({
  channelId: channelIdSchema,
  uploadId: uploadIdSchema,
  s3UploadId: z.string().min(1).max(1024),
  s3UploadKey: z.string().min(1).max(1024),
});

export const findMirrorDuplicatesSchema = z.object({
  channelId: channelIdSchema,
  candidates: z
    .array(
      z.object({
        key: z.string().min(1).max(64),
        title: z.string().max(MIRROR_TITLE_MAX),
        publishedAt: z.date(),
        lengthSeconds: z.number().nonnegative().max(1_000_000).nullish(),
        originalFileName: mirrorFileNameSchema.nullish(),
      }),
    )
    .min(1)
    .max(MIRROR_DUPLICATE_CANDIDATES_MAX),
});
