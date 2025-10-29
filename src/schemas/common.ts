import short from 'short-uuid';
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

export const AvatarSize = z.enum(['standard']).optional().default('standard');

type Resize = { resize: { width: number; height?: number } };

export function getAvatarResize(_size?: z.infer<typeof AvatarSize>): Resize {
  return { resize: { width: 120, height: 120 } };
}

export const ThumbnailSize = z
  .enum(['featured', 'card', 'saved', 'standard', 'table', 'poster'])
  .optional()
  .default('standard');

export function getThumbnailResize(
  size?: z.infer<typeof ThumbnailSize>,
): Resize {
  if (size === 'featured') {
    return { resize: { width: 1280 } };
  }

  if (size === 'poster') {
    return { resize: { width: 1280 } };
  }

  if (size === 'card') {
    return { resize: { width: 512 } };
  }

  if (size === 'saved') {
    return { resize: { width: 228 } };
  }

  if (size === 'table') {
    return { resize: { width: 120 } };
  }

  return { resize: { width: 1280 } };
}

const UuidSchema = z.uuid();
const idTranslator = short(short.constants.flickrBase58);

export const IncomingIdSchema = z.string().transform((val, ctx) => {
  if (UuidSchema.safeParse(val).success) {
    return val.toLowerCase();
  }

  if (idTranslator.validate(val)) {
    return idTranslator.toUUID(val).toLowerCase();
  }

  ctx.addIssue({
    code: 'custom',
    message: 'Invalid ID: must be a valid UUID or base58 string',
  });

  return z.NEVER;
});

export const OutgoingIdSchema = z.string().transform((val, ctx) => {
  if (UuidSchema.safeParse(val).success) {
    return idTranslator.fromUUID(val);
  }

  if (idTranslator.validate(val)) {
    return val;
  }

  ctx.addIssue({
    code: 'custom',
    message: 'Invalid ID: must be a valid UUID or base58 string',
  });

  return z.NEVER;
});
